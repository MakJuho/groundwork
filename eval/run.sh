#!/usr/bin/env bash
# 헤드리스로 Groundwork 명령 하나를 실행한다. groundwork 플러그인과 vendor/diagram-design을 함께 불러온다.
# 사용: eval/run.sh <작업 폴더> "/groundwork:scan <대상 폴더> <출력 상위 폴더>"
set -euo pipefail
if [ $# -ne 2 ]; then
  echo 'usage: eval/run.sh <work-dir> "/groundwork:<명령> <인자...>"' >&2
  exit 2
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$1"
# Analyze waits on parallel doc writers; print mode would stop them after 10 minutes.
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
exec claude -p \
  --plugin-dir "$ROOT/plugin" \
  --plugin-dir "$ROOT/vendor/diagram-design" \
  --permission-mode acceptEdits \
  --allowedTools "Bash(node:*)" "Bash(python3:*)" "Bash(python:*)" "Bash(mv:*)" "Bash(mkdir:*)" "Bash(rm:*)" \
    Read Write Edit Glob Grep Skill Agent \
  -- "$2"
