#!/bin/zsh
# Keeps one live runner alive for every final (tonight's test final and Sunday's final).
# The runner waits by itself until a final is set, plays it to the end and exits; this loop then starts it again.
# If the runner crashes, the loop starts it again and it rejoins from the snapshot and the event history.
#   Build: the first argument, else the level 8 entry of runs/grind/round-builds.json (read at every start).
#   Log:   runs/grind/live-loop.log
#   Stop:  pkill -f live-loop.sh; pkill -f "^node runs/grind/live.ts runs/grind/rank"
# Only ONE runner may act on a final: this loop does not start while another real runner (not a rehearsal) is alive.
cd "$(dirname "$0")/../.." || exit 1
LOG=runs/grind/live-loop.log
say() { echo "$(date '+%F %T') $*" >> $LOG }
# Anchored at the start of the command line: only the runner's own node process counts, not a shell that merely names it.
others() { pgrep -fl "^node runs/grind/live\.ts runs/grind/rank" | grep -v -e "--emulate" | wc -l | tr -d ' ' }
say "loop started (pid $$)"
while true; do
  if [ "$(others)" != "0" ]; then [ -z "$WAITING" ] && say "a live runner is already alive: standing by until it exits"; WAITING=1; sleep 20; continue; fi
  WAITING=
  B=$1
  [ -z "$B" ] && B=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync("runs/grind/round-builds.json","utf8"))["8"]||""))}catch{}' 2>/dev/null)
  if [[ ! "$B" =~ ^l8-[a-z0-9-]+$ || ! -f runs/grind/rank/$B/policy.ts || ! -f runs/grind/rank/$B/level8-practice.json ]]; then say "no usable level 8 build ('$B'): using l8-k9"; B=l8-k9; fi
  say "starting the live runner with runs/grind/rank/$B"
  caffeinate -is hsec exec --only SPREAD_KEY -- node runs/grind/live.ts runs/grind/rank/$B >> $LOG 2>&1
  say "the live runner exited with $?"
  sleep 15
done
