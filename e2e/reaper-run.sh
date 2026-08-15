#!/usr/bin/env bash
#
# Entry point for an ephemeral-session harness (reaper). It exists for two
# reasons, and neither is worth folding into run.sh.
#
# The first is exit status. A harness hands `run.cmd` to /bin/sh, which is dash
# on some guests, and dash has no `pipefail` -- so `run.sh | tee log` would exit
# with tee's status and report a failing suite as a pass. Worse, a harness that
# snapshots after a successful run would then take that snapshot on the strength
# of the false pass. Owning the pipeline here, under a shell we chose, is the
# sanctioned way out of that.
#
# The second is artifacts. Playwright's traces and report are written under
# frontend/, and the machine they are on is scheduled for destruction. Anything
# under $REAPER_OUT is collected back continuously, so the traces from a failed
# run reach the workstation instead of dying with the session. That collection
# has to happen whether the suite passed or failed -- a failure is the case that
# needs it -- which is why the status is captured and re-raised at the end
# rather than allowed to abort the script.
#
# Outside a session, $REAPER_OUT is unset and everything lands in e2e/out/, so
# this is runnable by hand for debugging what a session did.
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"
OUT="${REAPER_OUT:-${HERE}/out}"

mkdir -p "${OUT}"

status=0
# pipefail is set, so this is the suite's status and not tee's.
"${HERE}/run.sh" "$@" 2>&1 | tee "${OUT}/e2e.log" || status=$?

# Always, including -- especially -- after a failure.
collect() {
  local src="$1" name="$2"
  [[ -e "${src}" ]] || return 0
  rm -rf "${OUT:?}/${name}"
  cp -R "${src}" "${OUT}/${name}"
  echo "collected ${name}"
}

collect "${ROOT}/frontend/playwright-report" playwright-report
collect "${ROOT}/frontend/test-results"      test-results
collect "${HERE}/journeys/handle.json"       journey-handle.json

# Which of these belong to *this* run.
#
# The session's out/ is rebuilt every time, but the copy that reaches the
# workstation is not: the backward sync never deletes, deliberately, because it
# is not authoritative for what was in that directory beforehand. So a trace
# from a run three cycles ago sits next to a fresh one looking identical, and
# reading the wrong one costs an investigation. It nearly cost this one.
{
  echo "run finished: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "suite exit:   ${status}"
  echo "collected by this run:"
  for name in playwright-report test-results journey-handle.json e2e.log; do
    if [[ -e "${OUT}/${name}" ]]; then echo "  ${name}"; fi
  done
} > "${OUT}/RUN.txt"

exit "${status}"
