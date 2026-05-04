#!/bin/bash
# 매 commit 후 자동 실행 — server/patch_log.jsonl 에 1줄 append.
# install_hooks.sh 가 .git/hooks/post-commit 으로 심볼릭 링크.
# 운영 에이전트(hq-ops)가 git log 대신 이 파일을 읽어 빠른 회독.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
LOG_PATH="$REPO_ROOT/server/patch_log.jsonl"
mkdir -p "$(dirname "$LOG_PATH")"

SHA=$(git rev-parse HEAD)
SHORT_SHA=$(git rev-parse --short=9 HEAD)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUTHOR=$(git log -1 --pretty=%an)
SUBJECT=$(git log -1 --pretty=%s)
BODY=$(git log -1 --pretty=%b | head -c 800)
FILES=$(git diff-tree --no-commit-id --name-only -r HEAD | head -20 | paste -sd "," -)
INS=$(git show --stat --pretty="" HEAD | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
DEL=$(git show --stat --pretty="" HEAD | tail -1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

# Conventional Commits 파싱 — type(scope): subject
TYPE=""
SCOPE=""
if [[ "$SUBJECT" =~ ^([a-z]+)(\(([a-z0-9_-]+)\))?:[[:space:]] ]]; then
  TYPE="${BASH_REMATCH[1]}"
  SCOPE="${BASH_REMATCH[3]}"
fi

# JSON 안전 인코딩 — python3 사용 (특수문자/줄바꿈 처리)
python3 -c "
import json, sys
row = {
  'ts': '$TS',
  'sha': '$SHA',
  'short_sha': '$SHORT_SHA',
  'author': '''$AUTHOR''',
  'subject': '''${SUBJECT//\'/\\\'}''',
  'body': '''${BODY//\'/\\\'}''',
  'type': '$TYPE',
  'scope': '$SCOPE',
  'files': '''$FILES'''.split(',') if '''$FILES''' else [],
  'insertions': int('$INS' or 0),
  'deletions': int('$DEL' or 0),
}
with open('$LOG_PATH', 'a', encoding='utf-8') as f:
  f.write(json.dumps(row, ensure_ascii=False) + '\n')
" 2>/dev/null || true
