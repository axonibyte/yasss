#!/usr/bin/env bash
#
# End-to-end suite against the real stack.
#
# Everything else in this repo tests the frontend against a fake API. That fake
# is faithful where I knew to make it faithful, which is exactly its limit --
# the bugs worth catching are the ones nobody thought to model. This runs the
# actual server, against an actual MariaDB, with the actual schema migrations,
# and drives it through a real browser.
#
# Stages: build -> up -> migrate/health -> fuzz -> browser -> down.
#
# Every driver runs *inside* the pod, in a container. Nothing but podman and a
# JDK is needed on the host: no node, no npx, no locally installed Playwright
# browsers, and -- the point of the arrangement -- no published ports, since a
# driver in the pod reaches the app on the same `127.0.0.1` the app's own config
# names. Publishing is then only ever a debugging convenience.
#
# Teardown runs on any exit path, including Ctrl-C and a failed stage. Use
# --keep to leave the stack running for debugging.
set -Eeuo pipefail

readonly POD=yasss-e2e
readonly DB_CTR=yasss-e2e-db
readonly APP_CTR=yasss-e2e-app
readonly MAIL_CTR=yasss-e2e-mail
readonly APP_IMAGE=localhost/yasss-e2e:latest
readonly APP_PORT="${YASSS_E2E_PORT:-7455}"
readonly MAIL_PORT="${YASSS_E2E_MAIL_PORT:-8025}"
readonly DB_ROOT_PW=root-test-pw
readonly DB_NAME=yasss
readonly DB_USER=yasss
readonly DB_PW=yasss-test-pw

# glibc, deliberately. An alpine/musl image hangs indefinitely under FreeBSD's
# linuxulator rather than failing, which is a miserable thing to debug.
readonly DRIVER_IMAGE=docker.io/library/node:22-slim
# Keep in sync with @playwright/test in frontend/package.json and with the image
# bitbucket-pipelines.yml uses: Playwright refuses to run browsers it did not
# ship with. The browsers come from the image, so nothing is downloaded here.
readonly BROWSER_IMAGE=mcr.microsoft.com/playwright:v1.62.1-noble

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT="$(cd "${HERE}/.." && pwd)"

# Inside the pod, always. These are not host addresses and do not depend on
# whether anything is published.
readonly API=http://127.0.0.1:7455
readonly MAILPIT=http://127.0.0.1:8025

# Kept because the parser below consumes "$@" with shift, and the lock further
# down re-executes this script with its original arguments.
ORIG_ARGS=("$@")

KEEP=0
SKIP_BUILD=0
STAGES="fuzz,accounts,sessions,reminders,text,concurrency,regressions,browser,health"

usage() {
  cat <<'USAGE'
usage: e2e/run.sh [options]

  --keep           leave the stack running after the suite finishes
  --skip-build     reuse the existing jar and image
  --only STAGES    comma-separated subset of:
                   fuzz,accounts,sessions,reminders,text,concurrency,regressions,
                   browser,health
                   (default: all)
                   Note that `sessions` restarts the application mid-stage and
                   `health` stops the database under it; both are the point of
                   those stages, and both run where nothing after them depends
                   on the stack staying up.
  -h, --help       this text

Environment:
  YASSS_E2E_PORT      host port for the app when publishing (default 7455)
  YASSS_E2E_MAIL_PORT host port for mailpit's web UI when publishing (default 8025)
  YASSS_E2E_BROWSERS  space-separated Playwright projects for the browser stage
                      (default: chromium). The cross-engine @compat matrix lives
                      on the fake suite -- npm run test:e2e:compat -- which is
                      parallel and needs no stack; this is for checking the
                      bundle the jar actually serves. Note that WebKit does not
                      run under FreeBSD's linuxulator.
  YASSS_E2E_PUBLISH   1 to publish those ports to the host, 0 not to. Defaults to
                      1, and to 0 on a FreeBSD host with no pf(4) -- podman
                      publishes ports by writing pf rules, so without it the pod
                      cannot start at all. Nothing in the suite needs publishing;
                      it is for poking at a --keep stack from the host.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --only) STAGES="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$*" >&2; }
die() { printf '\n\033[1;31m==> FAILED\033[0m %s\n' "$*" >&2; exit 1; }

has_stage() { [[ ",${STAGES}," == *",$1,"* ]]; }

# Re-runs this script under `$@ <lockfile> <script> <args...>`, tolerating the
# no-argument case, which `set -u` would otherwise reject on older bash.
exec_locked() {
  if [[ ${#ORIG_ARGS[@]} -gt 0 ]]; then
    exec "$@" "${E2E_LOCK}" "$0" "${ORIG_ARGS[@]}"
  fi
  exec "$@" "${E2E_LOCK}" "$0"
}

# --- one suite at a time ------------------------------------------------------
#
# Every e2e suite on this host drives the same rootful podman: one state
# database, one storage tree, one OCI runtime. Two of them running at once
# corrupt each other, and not through anything either script does wrong --
# neither touches the other's containers by name. It is contention on shared
# global state, and it shows up two ways:
#
#   - `ocijail: mounting /catatonit ... Device busy` when a second pod starts,
#     because podman nullfs-mounts that one host binary into every pod's infra
#     container; and
#   - containers disappearing mid-run, with the pod's own container count
#     disagreeing with what exists. That is podman's bookkeeping losing
#     coherence under concurrent mutation, and it is indistinguishable from a
#     real failure until you go looking -- it cost most of a day before anyone
#     worked out what it was.
#
# So the suites take turns. The lock is host-wide and deliberately not named
# after this project: any sibling suite sharing this podman must take the *same*
# one, or it does nothing. Advisory, and released when the holder dies, so a
# killed run leaves nothing to clean up.
readonly E2E_LOCK="${AXB_E2E_LOCK:-/tmp/axb-e2e.lock}"
readonly E2E_LOCK_WAIT="${AXB_E2E_LOCK_WAIT:-3600}"

if [[ -z "${AXB_E2E_LOCK_HELD:-}" ]]; then
  export AXB_E2E_LOCK_HELD=1

  # Re-executes rather than wrapping the body, so the lock is held for the
  # whole run including teardown. Placed after argument parsing so that --help
  # answers immediately rather than queueing behind somebody else's suite.
  if command -v flock >/dev/null 2>&1; then
    flock -n "${E2E_LOCK}" true 2>/dev/null \
      || printf '\n\033[1;33m warn\033[0m another e2e suite holds %s; waiting\n' "${E2E_LOCK}" >&2
    exec_locked flock -w "${E2E_LOCK_WAIT}"
  elif command -v lockf >/dev/null 2>&1; then
    # FreeBSD. -k keeps the file, so the lock is not unlinked out from under a
    # process that is waiting on it.
    lockf -kns "${E2E_LOCK}" true 2>/dev/null \
      || printf '\n\033[1;33m warn\033[0m another e2e suite holds %s; waiting\n' "${E2E_LOCK}" >&2
    exec_locked lockf -k -t "${E2E_LOCK_WAIT}"
  else
    printf '\n\033[1;33m warn\033[0m neither flock nor lockf found; running unserialised.\n' >&2
    printf '        If another e2e suite runs concurrently, both may fail in ways\n' >&2
    printf '        that look like application bugs.\n' >&2
  fi
fi


# --- host differences -------------------------------------------------------

# Three things differ on FreeBSD, and nothing else does. Linux takes every
# default, so this is invisible there.
#
#   1. podman has no rootless mode on FreeBSD and refuses to start without root.
#   2. Containers are jails run by ocijail, so podman reports the host OS as
#      freebsd and a multi-arch manifest resolves to nothing. Linux images do
#      run -- via the linuxulator -- but only if asked for by platform.
#   3. Running as root means containers write into the repo as root, so the
#      drivers get the invoking user's ids.
PODMAN=(podman)
PLATFORM_ARGS=()
DB_USER_ARGS=()
DRIVER_USER_ARGS=()

if [[ "$(uname -s)" == FreeBSD ]]; then
  PODMAN=(sudo -n podman)
  PLATFORM_ARGS=(--os linux --arch amd64)
  DRIVER_USER_ARGS=(--user "$(id -u):$(id -g)")
  # mariadb's entrypoint reads /proc/self/cgroup when it is uid 0, and the
  # linuxulator's procfs has no such file, so the container dies on the spot
  # with `set -e` and no useful message. As any other user it never looks.
  DB_USER_ARGS=(--user mysql)
fi

pm() { "${PODMAN[@]}" "$@"; }

if [[ -n "${YASSS_E2E_PUBLISH:-}" ]]; then
  PUBLISH="${YASSS_E2E_PUBLISH}"
elif [[ "$(uname -s)" == FreeBSD && ! -c /dev/pf ]]; then
  PUBLISH=0
else
  PUBLISH=1
fi

# --- teardown ---------------------------------------------------------------

teardown() {
  local code=$?
  # Registered for EXIT as well as INT/TERM, so a signal would otherwise run
  # this twice -- once for the signal, once for the exit it causes.
  trap - EXIT INT TERM
  if [[ ${KEEP} -eq 1 ]]; then
    log "leaving the stack up (--keep); tear down with: ${PODMAN[*]} pod rm -f ${POD}"
    return
  fi

  log "tearing down"
  # The pod owns every container, so removing it is enough; the individual
  # removals are belt and braces for a partially-created stack.
  pm pod rm -f "${POD}" >/dev/null 2>&1 || true
  pm rm -f "${DB_CTR}" "${APP_CTR}" "${MAIL_CTR}" >/dev/null 2>&1 || true

  if [[ ${code} -ne 0 ]]; then
    printf '\033[1;31m==> suite failed (exit %s)\033[0m\n' "${code}" >&2
  fi
}
trap teardown EXIT INT TERM

# Fail loudly about *where* something broke rather than leaving a bare set -e.
trap 'die "at ${BASH_SOURCE[0]}:${LINENO}"' ERR

# --- drivers ----------------------------------------------------------------

# Extra `KEY=VALUE` pairs for the *next* drive() call only; drive() consumes and
# clears it, so a value set for one stage cannot leak into the next.
#
# Assign on its own line -- `DRIVE_ENV=(...) drive ...` is a bash syntax error
# rather than the temporary assignment it looks like, because drive is a
# function and arrays cannot be passed that way regardless.
DRIVE_ENV=()

# Run something in the pod against the live stack. The repo is mounted rather
# than copied so a driver can be edited and re-run without rebuilding anything;
# it is writable because Playwright puts its traces and report under frontend/.
drive() {
  local image="$1" workdir="$2"; shift 2

  local env_args=(
    -e "HOME=/tmp"
    -e "YASSS_API=${API}"
    -e "YASSS_MAILPIT=${MAILPIT}"
    -e "YASSS_LIVE_URL=${API}"
    # Empty until the bootstrap stage runs, which is after the first few calls.
    -e "YASSS_ADMIN_EMAIL=${YASSS_ADMIN_EMAIL:-}"
    -e "YASSS_ADMIN_PASSWORD=${YASSS_ADMIN_PASSWORD:-}"
    # Playwright looks here rather than in ~/.cache, so the browsers are the
    # ones baked into the image.
    -e "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright"
  )
  # Only when set: fuzz.mjs reads these with Number(x ?? default), and an empty
  # string is not nullish -- it would quietly become a zero-iteration run.
  [[ -n "${YASSS_ADMIN_ID:-}" ]] && env_args+=(-e "YASSS_ADMIN_ID=${YASSS_ADMIN_ID}")
  [[ -n "${FUZZ_ITERATIONS:-}" ]] && env_args+=(-e "FUZZ_ITERATIONS=${FUZZ_ITERATIONS}")
  [[ -n "${FUZZ_SEED:-}" ]] && env_args+=(-e "FUZZ_SEED=${FUZZ_SEED}")

  # `${#a[@]}` rather than `"${a[@]}"` -- expanding an empty array is an unbound
  # variable error under `set -u` on older bash, and the FreeBSD path is real.
  if [[ ${#DRIVE_ENV[@]} -gt 0 ]]; then
    local kv
    for kv in "${DRIVE_ENV[@]}"; do env_args+=(-e "${kv}"); done
  fi
  DRIVE_ENV=()

  pm run --rm --pod "${POD}" "${PLATFORM_ARGS[@]}" "${DRIVER_USER_ARGS[@]}" \
    -v "${ROOT}:/repo" -w "${workdir}" "${env_args[@]}" "${image}" "$@"
}

# --- preflight --------------------------------------------------------------

command -v "${PODMAN[-1]}" >/dev/null || die "podman is not installed"
pm info >/dev/null 2>&1 || die "podman is installed but cannot run; try: ${PODMAN[*]} info"

# A stale stack from an interrupted run would silently shadow this one.
if pm pod exists "${POD}" 2>/dev/null; then
  warn "removing a stale ${POD} pod from a previous run"
  pm pod rm -f "${POD}" >/dev/null
fi

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$1\b"
  elif command -v sockstat >/dev/null 2>&1; then
    # No ss(1) on FreeBSD. Field 6 is the local address, so match the port on
    # that alone -- the line also carries a foreign address that would collide.
    sockstat -4 -6 -l 2>/dev/null | awk '{print $6}' | grep -qE "[:.]$1$"
  else
    return 1
  fi
}

if [[ ${PUBLISH} -eq 1 ]] && port_in_use "${APP_PORT}"; then
  die "port ${APP_PORT} is already in use; set YASSS_E2E_PORT to something else"
fi

ensure_image() {
  pm image exists "$1" 2>/dev/null || {
    log "pulling $1"
    pm pull "${PLATFORM_ARGS[@]}" "$1" >/dev/null || die "could not pull $1"
  }
}

# --- build ------------------------------------------------------------------

if [[ ${SKIP_BUILD} -eq 0 ]]; then
  log "building the shadow jar (this also runs the Vite build)"
  # The frontend is served from the jar's classpath, so this is what guarantees
  # the browser tests exercise the same bundle a deployment would serve.
  ( cd "${ROOT}" && ./gradlew --quiet shadowJar ) || die "gradle build failed"

  jar="$(ls -1 "${ROOT}"/build/libs/*.jar 2>/dev/null | head -1)"
  [[ -n "${jar}" ]] || die "no jar produced in build/libs"
  cp "${jar}" "${HERE}/yasss.jar"

  # The shadow jar merges META-INF/services rather than letting one file win.
  # gRPC discovers its name resolvers and load balancers there, and reCAPTCHA
  # Enterprise is reached through gRPC -- so without the merge these registries
  # hold one entry each and CAPTCHA verification fails in the jar and nowhere
  # else. Both shipped configs disable CAPTCHA, so nothing else would notice.
  for svc in io.grpc.LoadBalancerProvider io.grpc.NameResolverProvider; do
    entries="$(unzip -p "${HERE}/yasss.jar" "META-INF/services/${svc}" 2>/dev/null | grep -c . || true)"
    [[ "${entries:-0}" -gt 1 ]] \
      || die "${svc} has ${entries:-0} entries in the jar; shadowJar lost mergeServiceFiles()"
  done
  echo "  gRPC service registries survived the shadow jar"

  # The artefact keeps a fixed name on purpose -- this script globs for it and
  # the Containerfile copies it by name -- so the manifest is the only place the
  # build can say which build it is. shadowJar inherits the `jar` task's
  # manifest, which is exactly the sort of thing that stops being true after a
  # plugin upgrade and is silent when it does.
  stamped="$(unzip -p "${HERE}/yasss.jar" META-INF/MANIFEST.MF 2>/dev/null \
    | tr -d '\r' | grep -c '^Implementation-Version: .' || true)"
  [[ "${stamped:-0}" -ge 1 ]] \
    || die "the jar manifest carries no Implementation-Version; nothing will know which build is running"
  echo "  the jar knows which build it is"

  log "building the app image"
  pm build --quiet -t "${APP_IMAGE}" "${HERE}" >/dev/null || die "image build failed"
else
  log "skipping build (--skip-build)"
  [[ -f "${HERE}/yasss.jar" ]] || die "no jar to reuse; drop --skip-build"
fi

# The browser stage runs Playwright out of the repo's node_modules against the
# browsers in the image, so the install has to have happened. It normally has:
# the Gradle build above runs npmInstall.
if has_stage browser && [[ ! -d "${ROOT}/frontend/node_modules/@playwright" ]]; then
  die "frontend/node_modules is missing @playwright; run the build without --skip-build"
fi

# --- up ---------------------------------------------------------------------

ensure_image docker.io/library/mariadb:11
ensure_image docker.io/axllent/mailpit:latest
ensure_image "${DRIVER_IMAGE}"
has_stage browser && ensure_image "${BROWSER_IMAGE}"

if [[ ${PUBLISH} -eq 1 ]]; then
  log "creating pod ${POD} (app published on host port ${APP_PORT})"
  pm pod create --name "${POD}" -p "${APP_PORT}:7455" -p "${MAIL_PORT}:8025" >/dev/null
else
  # A pod with no network still has a loopback its containers share, which is
  # everything the suite needs. Podman publishes ports by writing pf rules, so
  # asking for them on a FreeBSD host without pf(4) fails the pod outright.
  log "creating pod ${POD} (no published ports)"
  pm pod create --name "${POD}" --network none >/dev/null
fi

log "starting mariadb"
# One pod so every container shares a network namespace: the app reaches the
# database on 127.0.0.1:3306, exactly as the config file expects, and the
# database is reachable from nowhere else.
#
# Deliberately started as latin1. mariadb:11 defaults to utf8mb4, and the schema
# never named a character set, so with the image default every emoji assertion in
# this suite passed by accident and proved nothing about a server configured any
# other way -- which, before MariaDB 11.6, is every server. Starting latin1 makes
# migration 017 and the charset assertions below actually load-bearing.
pm run -d --pod "${POD}" --name "${DB_CTR}" "${PLATFORM_ARGS[@]}" "${DB_USER_ARGS[@]}" \
  -e MARIADB_ROOT_PASSWORD="${DB_ROOT_PW}" \
  -e MARIADB_DATABASE="${DB_NAME}" \
  -e MARIADB_USER="${DB_USER}" \
  -e MARIADB_PASSWORD="${DB_PW}" \
  docker.io/library/mariadb:11 \
  --character-set-server=latin1 --collation-server=latin1_swedish_ci >/dev/null

log "waiting for the database"
for i in $(seq 1 90); do
  if pm exec "${DB_CTR}" mariadb-admin ping -h 127.0.0.1 --silent >/dev/null 2>&1; then
    echo "  database ready after ${i}s"
    break
  fi
  if [[ ${i} -eq 90 ]]; then
    pm logs "${DB_CTR}" 2>&1 | tail -30 >&2
    die "database never became ready"
  fi
  sleep 1
done

log "starting the mail sink"
# Reminders are only verifiable if the mail goes somewhere inspectable. Mailpit
# accepts SMTP on 1025 and exposes what it caught over HTTP on 8025.
pm run -d --pod "${POD}" --name "${MAIL_CTR}" "${PLATFORM_ARGS[@]}" \
  docker.io/axllent/mailpit:latest >/dev/null

log "starting the application"
# The schema is applied by the app itself at boot -- Database.setup runs every
# script in db/ on every start -- so a successful health check also means the
# migrations, including the new IPv6 one, applied cleanly against a real server.
pm run -d --pod "${POD}" --name "${APP_CTR}" "${APP_IMAGE}" >/dev/null

log "waiting for the API"
if ! drive "${DRIVER_IMAGE}" /repo/e2e node lib/await-http.mjs "${API}/v1" 120 '"status":"ok"'; then
  warn "application log follows:"
  pm logs "${APP_CTR}" 2>&1 | tail -40 >&2
  die "API never became ready"
fi

# Nothing below should see a 500 from a healthy server; a crash here is a real
# finding rather than a flaky environment.
log "verifying the schema actually applied"
tables="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SHOW TABLES;" 2>/dev/null | tr '\n' ' ')"
echo "  tables: ${tables}"
for t in yasss_user yasss_event yasss_activity yasss_event_window yasss_slot yasss_volunteer; do
  [[ "${tables}" == *"${t}"* ]] || die "expected table ${t} is missing"
done

# The IPv6 migration is new and idempotent by construction; prove both.
log "verifying the IPv6 migration"
col="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
            WHERE TABLE_NAME='yasss_volunteer' AND COLUMN_NAME='ip_addr_bin';" 2>/dev/null)"
[[ "${col}" == "varbinary(16)" ]] || die "ip_addr_bin is '${col}', expected varbinary(16)"
echo "  ip_addr_bin is ${col}"

# The server above was started as latin1 on purpose, so this is a real check:
# without migration 017 every one of these columns comes back latin1 and any
# emoji, CJK or astral-plane value is either a 500 or a silent '?'.
log "verifying the utf8mb4 migration"
bad="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT CONCAT(TABLE_NAME,'.',COLUMN_NAME,'=',CHARACTER_SET_NAME)
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA='${DB_NAME}'
              AND CHARACTER_SET_NAME IS NOT NULL
              AND CHARACTER_SET_NAME <> 'utf8mb4';" 2>/dev/null | tr '\n' ' ')"
[[ -z "${bad}" ]] || die "these columns are not utf8mb4: ${bad}"
echo "  every character column is utf8mb4"

# reminder_suppression's primary key is a VARCHAR(255): 1020 bytes once each
# character can take four. That fits DYNAMIC's 3072-byte limit and does not fit
# COMPACT's 767, so the conversion above silently depends on the row format.
rowfmt="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT ROW_FORMAT FROM information_schema.TABLES
            WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='yasss_reminder_suppression';" 2>/dev/null)"
[[ "${rowfmt}" == "Dynamic" ]] \
  || die "reminder_suppression is ${rowfmt}; a 255-char utf8mb4 primary key needs DYNAMIC"
echo "  reminder_suppression row format is ${rowfmt}"

# Captured here and compared after the restart below. CONVERT TO CHARACTER SET
# rebuilds a table whether or not there is anything to convert, and setup replays
# every script on every boot -- so an unguarded 017 would rebuild all eight
# tables on every start. A rebuild bumps CREATE_TIME; nothing else does.
created_before="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT CREATE_TIME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='yasss_volunteer';" 2>/dev/null)"

log "restarting the app to prove the migrations are re-runnable"
# Database.setup tracks nothing and replays every script on every boot, so a
# second start is the only thing that proves the migrations are idempotent.
pm restart "${APP_CTR}" >/dev/null
if ! drive "${DRIVER_IMAGE}" /repo/e2e node lib/await-http.mjs "${API}/v1" 120 '"status":"ok"'; then
  pm logs "${APP_CTR}" 2>&1 | tail -40 >&2
  die "app did not survive a restart -- a migration is not idempotent"
fi
echo "  survived a restart"

created_after="$(pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT CREATE_TIME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='yasss_volunteer';" 2>/dev/null)"
[[ "${created_before}" == "${created_after}" ]] \
  || die "yasss_volunteer was rebuilt on restart (${created_before} -> ${created_after}); 017's guard is not working"
echo "  no table was rebuilt on the second boot"

# --- bootstrap administrator ------------------------------------------------

# Deliberately unconditional, and deliberately before the fuzz stage.
#
# CreateUserEndpoint grants ADMIN only to the very first account and UNVERIFIED
# to everyone after; fuzz.mjs POSTs users at random. Escaping UNVERIFIED needs a
# token that is only ever emailed, and email is disabled here -- so if the
# fuzzer claims the first slot there is no route back and every authenticated
# browser test fails pointing nowhere near the cause.
#
# Unconditional so that --only browser still gets an administrator.
log "registering the bootstrap administrator"
export YASSS_ADMIN_EMAIL="e2e-admin@example.com"
export YASSS_ADMIN_PASSWORD="e2e-admin-password"
YASSS_ADMIN_ID="$( drive "${DRIVER_IMAGE}" /repo/frontend node tools/register-admin.mjs )" \
  || die "could not register the bootstrap administrator"
export YASSS_ADMIN_ID
echo "  administrator ${YASSS_ADMIN_ID}"

# --- test -------------------------------------------------------------------

failures=0

if has_stage fuzz; then
  log "fuzzing the API"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node fuzz/fuzz.mjs; then
    failures=$((failures + 1))
    warn "fuzz stage failed"
  fi
fi

if has_stage accounts; then
  log "verifying self-service registration end to end"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node accounts/verify.mjs; then
    failures=$((failures + 1))
    warn "accounts stage failed"
  fi
fi

if has_stage text; then
  log "verifying text round-trips and output escaping"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node text/verify.mjs; then
    failures=$((failures + 1))
    warn "text stage failed"
  fi
fi

if has_stage reminders; then
  # Slow by nature: the daemon polls on a one-minute interval here, and proving
  # a reminder is *not* re-sent means waiting out a second sweep. There is no
  # way to shorten it without making the thing being verified untrue.
  log "verifying reminders end to end (this waits on the sweep, ~3 minutes)"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node reminders/verify.mjs; then
    failures=$((failures + 1))
    warn "reminders stage failed"
  fi
fi

if has_stage concurrency; then
  log "verifying volunteer capacity under concurrent claims"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node concurrency/verify.mjs; then
    failures=$((failures + 1))
    warn "concurrency stage failed"
  fi
fi

if has_stage regressions; then
  log "verifying specific defects stay fixed"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node regressions/verify.mjs; then
    failures=$((failures + 1))
    warn "regressions stage failed"
  fi
fi

if has_stage sessions; then
  log "verifying session lifetime and revocation"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node sessions/verify.mjs; then
    failures=$((failures + 1))
    warn "sessions stage failed"
  else
    # Backdating the deadline is the only way to reach the 410 branch without
    # waiting out token.resetTTL, which is configured in minutes. Blanket rather
    # than scoped to one account so that nothing here has to convert a UUID to
    # the BINARY(16) the column holds: every outstanding reset in this throwaway
    # database is fair game.
    pm exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
      -e "UPDATE ${DB_NAME}.yasss_user SET reset_token_expires = 1
          WHERE reset_token IS NOT NULL;" >/dev/null 2>&1 \
      || warn "could not backdate the reset tokens"

    # The headline claim of the whole tier: the signing keys are durable, so a
    # deploy no longer signs out every user on the platform. Nothing observable
    # from inside one process can tell you that.
    log "restarting the app to prove sessions survive a deploy"
    pm restart "${APP_CTR}" >/dev/null
    if ! drive "${DRIVER_IMAGE}" /repo/e2e node lib/await-http.mjs "${API}/v1" 120 '"status":"ok"'; then
      pm logs "${APP_CTR}" 2>&1 | tail -40 >&2
      failures=$((failures + 1))
      warn "app did not come back up for the sessions stage"
    elif ! drive "${DRIVER_IMAGE}" /repo/e2e node sessions/after-restart.mjs; then
      failures=$((failures + 1))
      warn "sessions stage failed after the restart"
    fi
  fi
fi

if has_stage browser; then
  # Which engines the live ribbon runs on. Chromium alone by default: the whole
  # cross-engine matrix lives on the fake suite, which is parallel and needs no
  # stack, and what the live stage adds over it is the real server rather than a
  # second opinion on layout.
  #
  # Note that WebKit does not run under FreeBSD's linuxulator; on that host use
  # chromium,firefox,mobile-chromium.
  browser_args=()
  for p in ${YASSS_E2E_BROWSERS:-chromium}; do browser_args+=("--project=${p}"); done

  log "driving the real stack through a browser (${YASSS_E2E_BROWSERS:-chromium})"
  if ! drive "${BROWSER_IMAGE}" /repo/frontend \
      npx playwright test --config playwright.live.config.js "${browser_args[@]}"; then
    failures=$((failures + 1))
    warn "browser stage failed"
  fi
fi

if has_stage health; then
  log "verifying the readiness check reports on the database"
  if ! drive "${DRIVER_IMAGE}" /repo/e2e node health/verify.mjs; then
    failures=$((failures + 1))
    warn "health stage failed"
  else
    # Deliberately last, and deliberately destructive. Stopping the database
    # under a running app is the only way to reach the branch this stage exists
    # for, and nothing after it depends on the stack -- so if the pool does not
    # recover, the final health check below is what says so rather than some
    # unrelated stage failing mysteriously.
    log "stopping the database to prove the check goes red"
    pm stop "${DB_CTR}" >/dev/null 2>&1 || warn "could not stop the database"

    if ! drive "${DRIVER_IMAGE}" /repo/e2e node health/while-down.mjs; then
      failures=$((failures + 1))
      warn "health stage failed with the database down"
    fi

    log "restarting the database"
    pm start "${DB_CTR}" >/dev/null 2>&1 || die "could not restart the database"
    # The pool has to re-establish connections on its own; if it cannot, the
    # readiness check never goes green again and that is worth knowing.
    if ! drive "${DRIVER_IMAGE}" /repo/e2e node lib/await-http.mjs "${API}/v1" 120 '"status":"ok"'; then
      failures=$((failures + 1))
      warn "the app did not recover after the database came back"
    else
      echo "  and green again once the database returns"
    fi
  fi
fi

# The server must still be healthy at the end: a fuzz run that leaves it wedged
# but reports no individual failure is still a failure.
log "final health check"
drive "${DRIVER_IMAGE}" /repo/e2e node lib/await-http.mjs "${API}/v1" 10 '"status":"ok"' \
  >/dev/null || die "server is no longer healthy after the suite"

# A stack trace in the log is worth surfacing even when every assertion passed.
if pm logs "${APP_CTR}" 2>&1 | grep -qE '^\s+at com\.crowdease'; then
  warn "the application logged stack traces:"
  pm logs "${APP_CTR}" 2>&1 | grep -B3 -A6 '^\s\+at com\.crowdease' | head -40 >&2
  failures=$((failures + 1))
fi

[[ ${failures} -eq 0 ]] || die "${failures} stage(s) failed"

log "all stages passed"
