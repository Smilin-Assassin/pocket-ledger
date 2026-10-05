#!/usr/bin/env bash
# Runs every test. g1 and g2 first (they make the starting data), then the rest a few at a time.
# Usage: tests/run-all.sh            (from anywhere; starts a local server on 8765 if none is running)
#        JOBS=1 tests/run-all.sh     (one at a time)
set -u
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
JOBS="${JOBS:-3}"
if ! curl -s -o /dev/null http://localhost:8765/; then (cd .. && python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1; fi
start=$(date +%s); fails=0; out=$(mktemp -d)
run() { local t="$1"; if timeout 300 node "$t" > "$out/$t.log" 2>&1; then echo "ok    $t"; else echo "FAIL  $t"; grep -E "FAIL|Error" "$out/$t.log" | head -5 | sed 's/^/      /'; return 1; fi; }
for t in g1.js g2.js; do run "$t" || fails=$((fails+1)); done
rest=$(ls g*.js | grep -vx 'g1.js\|g2.js' | sort -V)
pids=(); names=()
for t in $rest; do
  run "$t" & pids+=($!); names+=("$t")
  if [ "${#pids[@]}" -ge "$JOBS" ]; then wait "${pids[0]}" || fails=$((fails+1)); pids=("${pids[@]:1}"); names=("${names[@]:1}"); fi
done
for p in "${pids[@]}"; do wait "$p" || fails=$((fails+1)); done
echo; echo "$(ls g*.js | wc -l) test files, $fails failed, $(( $(date +%s) - start ))s"
[ "$fails" -eq 0 ]
