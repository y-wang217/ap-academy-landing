#!/usr/bin/env bash
# Times GET requests so slow spots are measurable. Read-only: curl with no
# method override and no body. See docs/PERF.md.
# Env: BENCH_SITE (default https://www.apacademy.ca), BENCH_TRACKER_ORIGIN
#      (tracker's own vercel.app URL; direct rows skipped when unset),
#      BENCH_RUNS (default 20), BENCH_COOKIE (optional session cookie),
#      BENCH_DATE (default today). Extra paths may be passed as arguments.
set -euo pipefail

site="${BENCH_SITE:-https://www.apacademy.ca}"
direct="${BENCH_TRACKER_ORIGIN:-}"
runs="${BENCH_RUNS:-20}"
date_="${BENCH_DATE:-$(date +%F)}"
to="$(date --date="$date_ +7 days" +%F 2>/dev/null || date -v+7d -j -f %F "$date_" +%F)"
month="${date_%-*}"

paths=(/ /health /sat /tracker
  /tracker/api/scheduler/me
  /tracker/api/scheduler/staff
  "/tracker/api/scheduler/week?date=$date_"
  "/tracker/api/scheduler/classes/occurrences?from=$date_&to=$to"
  "/tracker/api/scheduler/conflicts?from=$date_&to=$to"
  "/tracker/api/scheduler/availability?from=$date_&to=$to"
  "/tracker/api/scheduler/monthly-review?month=$month")
[[ $# -gt 0 ]] && paths+=("$@")

if [[ -z "${BENCH_COOKIE:-}" ]]; then
  echo "note: BENCH_COOKIE is not set; authenticated rows are unauthenticated (expect 401 or a redirect)."
fi
if [[ -z "$direct" ]]; then
  echo "note: BENCH_TRACKER_ORIGIN is not set; direct-host rows are skipped."
fi

median() { sort -n | awk '{a[NR]=$1} END {if (NR==0) {print "-"; exit} printf "%.0f", (NR%2 ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2)}'; }
maxof() { sort -n | awk 'END {if (NR==0) print "-"; else printf "%.0f", $1}'; }

fmt='%-34s %-40s %4s %12s %12s %12s %12s %16s %7s %7s %7s  %s\n'
printf "$fmt" origin path status dns connect tls ttfb "total(med/max)" st:auth st:db st:total vercel-id

row() { # <origin> <path>
  local origin="$1" path="$2" i out hdrs status vid
  local dns=() con=() tls=() ttfb=() tot=() sa=() sd=() st=()
  for ((i = 0; i < runs; i++)); do
    # Cookie goes to curl on stdin (-H @-), never argv, never a file.
    out="$(
      { [[ -n "${BENCH_COOKIE:-}" ]] && printf 'Cookie: %s\n' "$BENCH_COOKIE"; true; } |
        curl -sS -o /dev/null -H @- -D - --max-time 30 \
          -w '\n__T__ %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{http_code}\n' \
          "$origin$path" 2>/dev/null || true
    )"
    local t; t="$(grep '^__T__' <<<"$out" | tail -1)"
    [[ -z "$t" ]] && continue
    read -r _ a b c d e status <<<"$t"
    dns+=("$(awk -v x="$a" 'BEGIN{print x*1000}')")
    con+=("$(awk -v x="$a" -v y="$b" 'BEGIN{print (y-x)*1000}')")
    tls+=("$(awk -v x="$b" -v y="$c" 'BEGIN{v=(y-x)*1000; print (v<0?0:v)}')")
    ttfb+=("$(awk -v x="$d" 'BEGIN{print x*1000}')")
    tot+=("$(awk -v x="$e" 'BEGIN{print x*1000}')")
    hdrs="$(grep -i '^\(server-timing\|x-vercel-id\):' <<<"$out" | sed "s/\r//" || true)"
    vid="$(grep -i '^x-vercel-id:' <<<"$hdrs" | tail -1 | cut -d' ' -f2- || true)"
    local sth; sth="$(grep -i '^server-timing:' <<<"$hdrs" | tail -1 || true)"
    for m in auth db total; do
      v="$(grep -o "$m;dur=[0-9.]*" <<<"$sth" | head -1 | cut -d= -f2 || true)"
      case $m in auth) [[ -n "$v" ]] && sa+=("$v");; db) [[ -n "$v" ]] && sd+=("$v");; total) [[ -n "$v" ]] && st+=("$v");; esac
    done
  done
  local md; md() { if (($# == 0)); then echo -; else printf '%s\n' "$@" | median; fi; }
  local mx; mx() { if (($# == 0)); then echo -; else printf '%s\n' "$@" | maxof; fi; }
  printf "$fmt" "${origin#https://}" "$path" "${status:--}" \
    "$(md "${dns[@]}")/$(mx "${dns[@]}")" "$(md "${con[@]}")/$(mx "${con[@]}")" "$(md "${tls[@]}")/$(mx "${tls[@]}")" \
    "$(md "${ttfb[@]}")/$(mx "${ttfb[@]}")" "$(md "${tot[@]}")/$(mx "${tot[@]}")" \
    "$(md "${sa[@]}")" "$(md "${sd[@]}")" "$(md "${st[@]}")" "${vid:--}"
}

for p in "${paths[@]}"; do row "$site" "$p"; done
if [[ -n "$direct" ]]; then
  for p in "${paths[@]}"; do [[ "$p" == /tracker* ]] && row "$direct" "$p"; done
fi
