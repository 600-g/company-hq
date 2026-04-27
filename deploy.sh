#!/bin/bash
# 두근컴퍼니 HQ 배포 (Cloudflare Pages → 600g.net)
#  - 빌드 대상: teammaker-classic/ (메인, 픽셀 오피스 이식됨)
#  - 기존 doogeun-hq/, ui/ 배포는 deploy-legacy-ui.sh 로 보존됨
set -e
cd "$(dirname "$0")/teammaker-classic"

BUILD_ID="$(git log --oneline -1 --format='%h' 2>/dev/null || date +%s)-$(date +%s)"

# 시맨틱 버전 규칙 (deploy.sh 와 동일: MAJOR=4 로 신규 라인)
MAJOR="4"
TOTAL_COMMITS="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
MINOR=$((TOTAL_COMMITS / 10))
PATCH=$((TOTAL_COMMITS % 10))
if [ "${MANUAL_MINOR_BUMP:-0}" = "1" ]; then
  MINOR=$((MINOR + 1))
  PATCH=0
fi
APP_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "📦 teammaker-classic version=$APP_VERSION build=$BUILD_ID"

echo "🔨 Building (NEXT_EXPORT=1)..."
NEXT_EXPORT=1 npx next build

# Next.js output:"export" 산출물은 out/
OUT_DIR="out"
if [ ! -d "$OUT_DIR" ]; then
  echo "❌ out/ 디렉토리 없음 — next.config.ts 의 output: 'export' 확인"
  exit 1
fi

# version.json — 자동 리로드 감지용
echo "{\"build\":\"$BUILD_ID\",\"version\":\"$APP_VERSION\",\"ts\":$(date +%s)}" > $OUT_DIR/version.json

echo "   파일 수: $(find $OUT_DIR -type f | wc -l)"
echo "🚀 Cloudflare Pages 배포..."
# CF Pages 프로젝트: 600g.net 도메인 유지를 위해 기존 company-hq 재사용
PROJECT_NAME="${DG_PROJECT_NAME:-company-hq}"
wrangler pages deploy $OUT_DIR \
  --project-name "$PROJECT_NAME" \
  --commit-message="deploy: $BUILD_ID" \
  --skip-caching
echo "✅ Done! build=$BUILD_ID · project=$PROJECT_NAME"

# 백엔드 변경 반영 — uvicorn --reload 제거된 구조라 명시적 kickstart
# (사용자 작업 중에는 코드 편집해도 안 끊김 / 배포 시점에만 ~2초 끊김)
if launchctl list 2>/dev/null | grep -q "com.company-hq-server"; then
  echo "🔄 FastAPI 재시작 (~2초)..."
  launchctl kickstart -k "gui/$(id -u)/com.company-hq-server" 2>/dev/null || true
fi
