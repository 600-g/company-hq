#!/bin/bash
# git hooks 설치 + 기존 commit 히스토리를 patch_log.jsonl 로 1회 backfill.
# 새 환경(또는 .git 재설치 후) 한 번만 실행:
#   bash scripts/install_hooks.sh

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_SRC="$REPO_ROOT/scripts/post_commit_hook.sh"
HOOK_DST="$REPO_ROOT/.git/hooks/post-commit"
LOG_PATH="$REPO_ROOT/server/patch_log.jsonl"

# 1) hook 심볼릭 링크 (실제 파일 변경되면 즉시 반영)
chmod +x "$HOOK_SRC"
ln -sf "$HOOK_SRC" "$HOOK_DST"
echo "[hooks] post-commit 설치: $HOOK_DST → $HOOK_SRC"

# 2) 기존 commit 히스토리 backfill (이미 있으면 skip 옵션)
if [ -f "$LOG_PATH" ] && [ "$1" != "--force" ]; then
  EXISTING=$(wc -l < "$LOG_PATH" | tr -d ' ')
  echo "[backfill] 기존 patch_log.jsonl ${EXISTING}줄 — skip (--force 옵션으로 재생성)"
  exit 0
fi

mkdir -p "$(dirname "$LOG_PATH")"
> "$LOG_PATH"

echo "[backfill] 전체 git log → patch_log.jsonl 생성 중..."
git log --reverse --pretty=format:"%H%x09%h%x09%aI%x09%an%x09%s" | \
python3 -c "
import sys, json, re, subprocess
n = 0
for line in sys.stdin:
  parts = line.rstrip().split('\t')
  if len(parts) < 5:
    continue
  sha, short, ts, author, subject = parts[:5]
  m = re.match(r'^([a-z]+)(\(([a-z0-9_-]+)\))?:\s', subject)
  type_, scope = (m.group(1), m.group(3) or '') if m else ('', '')
  try:
    files = subprocess.check_output(['git','diff-tree','--no-commit-id','--name-only','-r',sha], text=True).strip().split('\n')[:20]
    files = [f for f in files if f]
  except Exception:
    files = []
  row = {
    'ts': ts,
    'sha': sha,
    'short_sha': short,
    'author': author,
    'subject': subject,
    'body': '',
    'type': type_,
    'scope': scope,
    'files': files,
    'insertions': 0,
    'deletions': 0,
  }
  print(json.dumps(row, ensure_ascii=False))
  n += 1
sys.stderr.write(f'[backfill] {n}개 commit 기록\n')
" > "$LOG_PATH"

LINES=$(wc -l < "$LOG_PATH" | tr -d ' ')
echo "[backfill] ✅ patch_log.jsonl ${LINES}줄 생성"
echo "[hooks] 다음 commit 부터 자동 append"
