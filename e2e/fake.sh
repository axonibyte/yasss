#!/usr/bin/env bash
#
# The frontend suite against the *fake* API, in a container.
#
# run.sh's companion, and deliberately not one of its stages. run.sh exists to
# test the real thing: it builds the jar, raises a pod, a MariaDB and a mail
# sink, and migrates a schema before any stage runs. This suite needs none of
# that -- playwright.config.js brings its own server up with `node
# tests/fake/main.js` -- so hanging it off run.sh would mean paying for a stack
# it never touches.
#
# What it is for is that `./gradlew check` runs the Java and vitest suites and
# stops there, by design (see bitbucket-pipelines.yml), and Playwright will not
# run natively on FreeBSD. That left the browser suite unrunnable on this host
# and therefore only ever executed by CI, which is how a renamed button reached
# main as ten timeouts.
#
# Arguments are passed through to `playwright test`:
#
#   e2e/fake.sh                            the whole chromium suite
#   e2e/fake.sh tests/e2e/event.spec.js    one spec
#   e2e/fake.sh --skip-build ...           reuse the bundle already built
#   e2e/fake.sh --project=firefox          the @compat subset on another engine
#   CI=1 e2e/fake.sh                       as CI runs it: retries and workers
#
# Chromium unless a --project is named, which is what `npm run test:e2e` does
# and what the config's other three projects assume -- they carry `grep:
# /@compat/` and exist for the cross-engine matrix, not for a second opinion on
# every spec. Note that webkit does not run under FreeBSD's linuxulator: it
# fails in fixture setup rather than reporting anything useful, so on this host
# the matrix is firefox and mobile-chromium.
set -Eeuo pipefail

# Keep in sync with e2e/run.sh, which pins it against @playwright/test in
# frontend/package.json: Playwright refuses to run browsers it did not ship with.
readonly BROWSER_IMAGE=mcr.microsoft.com/playwright:v1.62.1-noble

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT="$(cd "${HERE}/.." && pwd)"

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m==> FAILED\033[0m %s\n' "$*" >&2; exit 1; }

# Same reasoning as run.sh: podman has no rootless mode on FreeBSD, a multi-arch
# manifest resolves to nothing there because the host OS reports as freebsd, and
# running as root would leave root-owned test-results/ in the repo.
PODMAN=(podman)
PLATFORM_ARGS=()
USER_ARGS=()
if [[ "$(uname -s)" == FreeBSD ]]; then
  PODMAN=(sudo -n podman)
  PLATFORM_ARGS=(--os linux --arch amd64)
  USER_ARGS=(--user "$(id -u):$(id -g)")
fi
pm() { "${PODMAN[@]}" "$@"; }

[[ -d "${ROOT}/frontend/node_modules/@playwright" ]] \
  || die "frontend/node_modules is missing @playwright; run ./gradlew npmInstall"

# The fake server serves the *built* bundle out of src/main/resources/public,
# not the Svelte source, so without this the suite quietly tests whatever was
# last built -- which passes a mutation of the very component under test and
# tells you nothing. CI gets this for free by running `npm run build` between
# the unit suite and this one; here it has to be said out loud.
#
# On the host rather than in the container: node_modules was installed by
# FreeBSD npm and carries FreeBSD-native binaries for rolldown and friends. The
# browsers are what needs Linux, not the bundler.
SKIP_BUILD=0
args=()
for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    *) args+=("$a") ;;
  esac
done

if [[ ${SKIP_BUILD} -eq 0 ]]; then
  log "building the bundle the fake will serve"
  (cd "${ROOT}" && ./gradlew --console=plain -q buildFrontend) \
    || die "buildFrontend failed"
else
  log "skipping the build (--skip-build)"
  [[ -f "${ROOT}/src/main/resources/public/index.html" ]] \
    || die "no bundle to reuse; drop --skip-build"
fi

pm image exists "${BROWSER_IMAGE}" 2>/dev/null || {
  log "pulling ${BROWSER_IMAGE}"
  pm pull "${PLATFORM_ARGS[@]}" "${BROWSER_IMAGE}" >/dev/null \
    || die "could not pull ${BROWSER_IMAGE}"
}

# Forwarded only when set. An empty CI is falsy in JS so it would work here by
# luck, but run.sh learned this lesson the hard way with FUZZ_ITERATIONS and the
# habit is cheaper than the exception.
env_args=(-e HOME=/tmp -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright)
[[ -n "${CI:-}" ]] && env_args+=(-e "CI=${CI}")
[[ -n "${FAKE_PORT:-}" ]] && env_args+=(-e "FAKE_PORT=${FAKE_PORT}")

# --network none, because the config's webServer binds loopback and nothing here
# talks to anything outside the container. It is also what makes this work on a
# FreeBSD host with no pf(4), where podman cannot write the rules a bridge needs
# -- the same reason run.sh's pod is built that way.
# `${a[@]+"${a[@]}"}` rather than `"${a[@]}"`: expanding an empty array is an
# unbound variable error under `set -u` on older bash, and run.sh already
# records that the FreeBSD path is real.
if [[ " ${args[*]-} " != *" --project"* ]]; then
  args=(--project=chromium ${args[@]+"${args[@]}"})
fi

log "running the fake suite in ${BROWSER_IMAGE}"
exec "${PODMAN[@]}" run --rm --network none "${PLATFORM_ARGS[@]}" "${USER_ARGS[@]}" \
  -v "${ROOT}:/repo" -w /repo/frontend \
  "${env_args[@]}" \
  "${BROWSER_IMAGE}" \
  npx playwright test "${args[@]}"
