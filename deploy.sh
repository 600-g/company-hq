#!/bin/bash
# 두근컴퍼니 HQ 배포 (Cloudflare Pages → 600g.net)
#  - 빌드 대상: doogeun-hq/ (Next.js 16 + React 19 + Phaser 3 + 정적 export)
#  - 메인 프로덕트 (600g.net) — teammaker-classic / ui 는 제거됨 (2026-04-27)
set -e
cd "$(dirname "$0")/doogeun-hq"

BUILD_ID="$(git log --oneline -1 --format='%h' 2>/dev/null || date +%s)-$(date +%s)"

# 시맨틱 버전 — MAJOR=4 라인
MAJOR="4"
TOTAL_COMMITS="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
MINOR=$((TOTAL_COMMITS / 10))
PATCH=$((TOTAL_COMMITS % 10))
if [ "${MANUAL_MINOR_BUMP:-0}" = "1" ]; then
  MINOR=$((MINOR + 1))
  PATCH=0
fi
APP_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "📦 doogeun-hq version=$APP_VERSION build=$BUILD_ID"

echo "🔨 Building (NEXT_EXPORT=1)..."
NEXT_EXPORT=1 npx next build

OUT_DIR="out"
if [ ! -d "$OUT_DIR" ]; then
  echo "❌ out/ 디렉토리 없음 — next.config.ts 의 output: 'export' 확인"
  exit 1
fi

echo "{\"build\":\"$BUILD_ID\",\"version\":\"$APP_VERSION\",\"ts\":$(date +%s)}" > $OUT_DIR/version.json

echo "   파일 수: $(find $OUT_DIR -type f | wc -l)"
echo "🚀 Cloudflare Pages 배포..."
PROJECT_NAME="${DG_PROJECT_NAME:-company-hq}"
wrangler pages deploy $OUT_DIR \
  --project-name "$PROJECT_NAME" \
  --commit-message="deploy: $BUILD_ID" \
  --skip-caching
echo "✅ Done! build=$BUILD_ID · project=$PROJECT_NAME"

# 백엔드 변경 반영 — uvicorn --reload 제거된 구조라 명시적 kickstart
if launchctl list 2>/dev/null | grep -q "com.company-hq-server"; then
  echo "🔄 FastAPI 재시작 (~2초)..."
  launchctl kickstart -k "gui/$(id -u)/com.company-hq-server" 2>/dev/null || true
fi
