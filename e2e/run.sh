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

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT="$(cd "${HERE}/.." && pwd)"

KEEP=0
SKIP_BUILD=0
STAGES="fuzz,accounts,reminders,browser"

usage() {
  cat <<'USAGE'
usage: e2e/run.sh [options]

  --keep           leave the stack running after the suite finishes
  --skip-build     reuse the existing jar and image
  --only STAGES    comma-separated subset of: fuzz,accounts,reminders,browser  (default: all)
  -h, --help       this text

Environment:
  YASSS_E2E_PORT   host port for the app (default 7455)
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

# --- teardown ---------------------------------------------------------------

teardown() {
  local code=$?
  # Registered for EXIT as well as INT/TERM, so a signal would otherwise run
  # this twice -- once for the signal, once for the exit it causes.
  trap - EXIT INT TERM
  if [[ ${KEEP} -eq 1 ]]; then
    log "leaving the stack up (--keep); tear down with: podman pod rm -f ${POD}"
    return
  fi

  log "tearing down"
  # The pod owns both containers, so removing it is enough; the individual
  # removals are belt and braces for a partially-created stack.
  podman pod rm -f "${POD}" >/dev/null 2>&1 || true
  podman rm -f "${DB_CTR}" "${APP_CTR}" "${MAIL_CTR}" >/dev/null 2>&1 || true

  if [[ ${code} -ne 0 ]]; then
    printf '\033[1;31m==> suite failed (exit %s)\033[0m\n' "${code}" >&2
  fi
}
trap teardown EXIT INT TERM

# Fail loudly about *where* something broke rather than leaving a bare set -e.
trap 'die "at ${BASH_SOURCE[0]}:${LINENO}"' ERR

# --- preflight --------------------------------------------------------------

command -v podman >/dev/null || die "podman is not installed"
command -v node >/dev/null || die "node is not installed"

# A stale stack from an interrupted run would silently shadow this one.
if podman pod exists "${POD}" 2>/dev/null; then
  warn "removing a stale ${POD} pod from a previous run"
  podman pod rm -f "${POD}" >/dev/null
fi

if ss -ltn 2>/dev/null | grep -q ":${APP_PORT}\b"; then
  die "port ${APP_PORT} is already in use; set YASSS_E2E_PORT to something else"
fi

# --- build ------------------------------------------------------------------

if [[ ${SKIP_BUILD} -eq 0 ]]; then
  log "building the shadow jar (this also runs the Vite build)"
  # The frontend is served from the jar's classpath, so this is what guarantees
  # the browser tests exercise the same bundle a deployment would serve.
  ( cd "${ROOT}" && ./gradlew --quiet shadowJar ) || die "gradle build failed"

  jar="$(ls -1 "${ROOT}"/build/libs/*.jar 2>/dev/null | head -1)"
  [[ -n "${jar}" ]] || die "no jar produced in build/libs"
  cp "${jar}" "${HERE}/yasss.jar"

  log "building the app image"
  podman build --quiet -t "${APP_IMAGE}" "${HERE}" >/dev/null || die "image build failed"
else
  log "skipping build (--skip-build)"
  [[ -f "${HERE}/yasss.jar" ]] || die "no jar to reuse; drop --skip-build"
fi

# --- up ---------------------------------------------------------------------

log "creating pod ${POD} (app on host port ${APP_PORT})"
# One pod so both containers share a network namespace: the app reaches the
# database on 127.0.0.1:3306, exactly as the config file expects. Only the app
# port is published; the database stays internal.
podman pod create --name "${POD}" -p "${APP_PORT}:7455" -p "${MAIL_PORT}:8025" >/dev/null

log "starting mariadb"
podman run -d --pod "${POD}" --name "${DB_CTR}" \
  -e MARIADB_ROOT_PASSWORD="${DB_ROOT_PW}" \
  -e MARIADB_DATABASE="${DB_NAME}" \
  -e MARIADB_USER="${DB_USER}" \
  -e MARIADB_PASSWORD="${DB_PW}" \
  docker.io/library/mariadb:11 >/dev/null

log "waiting for the database"
for i in $(seq 1 60); do
  if podman exec "${DB_CTR}" mariadb-admin ping -h 127.0.0.1 --silent >/dev/null 2>&1; then
    echo "  database ready after ${i}s"
    break
  fi
  [[ ${i} -eq 60 ]] && die "database never became ready"
  sleep 1
done

log "starting the mail sink"
# Reminders are only verifiable if the mail goes somewhere inspectable. Mailpit
# accepts SMTP on 1025 and exposes what it caught over HTTP on 8025.
podman run -d --pod "${POD}" --name "${MAIL_CTR}" \
  docker.io/axllent/mailpit:latest >/dev/null

log "starting the application"
# The schema is applied by the app itself at boot -- Database.setup runs every
# script in db/ on every start -- so a successful health check also means the
# migrations, including the new IPv6 one, applied cleanly against a real server.
podman run -d --pod "${POD}" --name "${APP_CTR}" "${APP_IMAGE}" >/dev/null

log "waiting for the API"
api="http://127.0.0.1:${APP_PORT}"
for i in $(seq 1 90); do
  if curl -fsS "${api}/v1" 2>/dev/null | tr -d " \n" | grep -q '"status":"ok"'; then
    echo "  API ready after ${i}s"
    break
  fi
  if [[ ${i} -eq 90 ]]; then
    warn "application log follows:"
    podman logs "${APP_CTR}" 2>&1 | tail -40 >&2
    die "API never became ready"
  fi
  sleep 1
done

# Nothing below should see a 500 from a healthy server; a crash here is a real
# finding rather than a flaky environment.
log "verifying the schema actually applied"
tables="$(podman exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SHOW TABLES;" 2>/dev/null | tr '\n' ' ')"
echo "  tables: ${tables}"
for t in yasss_user yasss_event yasss_activity yasss_event_window yasss_slot yasss_volunteer; do
  [[ "${tables}" == *"${t}"* ]] || die "expected table ${t} is missing"
done

# The IPv6 migration is new and idempotent by construction; prove both.
log "verifying the IPv6 migration"
col="$(podman exec "${DB_CTR}" mariadb -u"${DB_USER}" -p"${DB_PW}" "${DB_NAME}" \
  -N -B -e "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
            WHERE TABLE_NAME='yasss_volunteer' AND COLUMN_NAME='ip_addr_bin';" 2>/dev/null)"
[[ "${col}" == "varbinary(16)" ]] || die "ip_addr_bin is '${col}', expected varbinary(16)"
echo "  ip_addr_bin is ${col}"

log "restarting the app to prove the migrations are re-runnable"
# Database.setup tracks nothing and replays every script on every boot, so a
# second start is the only thing that proves the migrations are idempotent.
podman restart "${APP_CTR}" >/dev/null
for i in $(seq 1 90); do
  curl -fsS "${api}/v1" 2>/dev/null | tr -d " \n" | grep -q '"status":"ok"' && break
  if [[ ${i} -eq 90 ]]; then
    podman logs "${APP_CTR}" 2>&1 | tail -40 >&2
    die "app did not survive a restart -- a migration is not idempotent"
  fi
  sleep 1
done
echo "  survived a restart"

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
YASSS_ADMIN_ID="$( cd "${ROOT}/frontend" && YASSS_API="${api}" node tools/register-admin.mjs )" \
  || die "could not register the bootstrap administrator"
export YASSS_ADMIN_ID
echo "  administrator ${YASSS_ADMIN_ID}"

# --- test -------------------------------------------------------------------

failures=0

if has_stage fuzz; then
  log "fuzzing the API"
  if ! ( cd "${HERE}" && YASSS_API="${api}" node fuzz/fuzz.mjs ); then
    failures=$((failures + 1))
    warn "fuzz stage failed"
  fi
fi

if has_stage accounts; then
  log "verifying self-service registration end to end"
  if ! ( cd "${HERE}" \
      && YASSS_API="${api}" YASSS_MAILPIT="http://127.0.0.1:${MAIL_PORT}" \
      node accounts/verify.mjs ); then
    failures=$((failures + 1))
    warn "accounts stage failed"
  fi
fi

if has_stage reminders; then
  # Slow by nature: the daemon polls on a one-minute interval here, and proving
  # a reminder is *not* re-sent means waiting out a second sweep. There is no
  # way to shorten it without making the thing being verified untrue.
  log "verifying reminders end to end (this waits on the sweep, ~3 minutes)"
  if ! ( cd "${HERE}" \
      && YASSS_API="${api}" YASSS_MAILPIT="http://127.0.0.1:${MAIL_PORT}" \
      node reminders/verify.mjs ); then
    failures=$((failures + 1))
    warn "reminders stage failed"
  fi
fi

if has_stage browser; then
  log "driving the real stack through a browser"
  if ! ( cd "${ROOT}/frontend" && YASSS_LIVE_URL="${api}" npx playwright test --config playwright.live.config.js ); then
    failures=$((failures + 1))
    warn "browser stage failed"
  fi
fi

# The server must still be healthy at the end: a fuzz run that leaves it wedged
# but reports no individual failure is still a failure.
log "final health check"
curl -fsS "${api}/v1" >/dev/null 2>&1 || die "server is no longer healthy after the suite"

# A stack trace in the log is worth surfacing even when every assertion passed.
if podman logs "${APP_CTR}" 2>&1 | grep -qE '^\s+at com\.crowdease'; then
  warn "the application logged stack traces:"
  podman logs "${APP_CTR}" 2>&1 | grep -B3 -A6 '^\s\+at com\.crowdease' | head -40 >&2
  failures=$((failures + 1))
fi

[[ ${failures} -eq 0 ]] || die "${failures} stage(s) failed"

log "all stages passed"
