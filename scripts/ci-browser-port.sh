#!/usr/bin/env bash
set -u

inspect_browser_port() {
  local phase="$1" listeners line remaining pid details seen=" "
  if ! command -v ss >/dev/null 2>&1; then
    printf '[ci-port] %s 43172 diagnostic_unavailable=ss_missing\n' "$phase"
    return 0
  fi
  if ! listeners=$(ss -H -ltnp 'sport = :43172' 2>/dev/null); then
    printf '[ci-port] %s 43172 diagnostic_unavailable=ss_failed\n' "$phase"
    return 0
  fi
  if [[ -z "$listeners" ]]; then
    printf '[ci-port] %s 43172 listener=empty\n' "$phase"
    return 0
  fi
  printf '[ci-port] %s 43172 listener=occupied\n' "$phase"
  if ! command -v ps >/dev/null 2>&1; then
    printf '[ci-port] %s 43172 process_details_unavailable=ps_missing\n' "$phase"
    return 0
  fi
  while IFS= read -r line; do
    remaining="$line"
    while [[ "$remaining" =~ pid=([0-9]+) ]]; do
      pid="${BASH_REMATCH[1]}"
      remaining="${remaining#*pid=$pid}"
      if [[ "$seen" == *" $pid "* ]]; then continue; fi
      seen="$seen$pid "
      if details=$(ps -p "$pid" -o pid=,ppid=,lstart=,comm= 2>/dev/null) && [[ -n "$details" ]]; then
        printf '[ci-port] %s 43172 pid_ppid_start_comm=%s\n' "$phase" "$details"
      else
        printf '[ci-port] %s 43172 process_details_unavailable pid=%s\n' "$phase" "$pid"
      fi
    done
  done <<< "$listeners"
  if [[ "$seen" == " " ]]; then
    printf '[ci-port] %s 43172 owner_pid=unavailable\n' "$phase"
  fi
  return 0
}

if [[ "$#" -eq 0 ]]; then
  printf 'usage: ci-browser-port.sh COMMAND [ARGS...]\n' >&2
  exit 64
fi

inspect_browser_port before
if "$@"; then
  status=0
else
  status=$?
fi
if [[ "$status" -ne 0 ]]; then inspect_browser_port after_failure; fi
exit "$status"
