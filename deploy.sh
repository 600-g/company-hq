#!/bin/bash
set -e
cd "$(dirname "$0")/ui"
BUILD_ID="$(git log --oneline -1 --format='%h' 2>/dev/null || date +%s)-$(date +%s)"
# 시맨틱 버전 규칙: MAJOR=3 고정, MINOR = (커밋수 / 10), PATCH = (커밋수 % 10)
# - 10커밋마다 MINOR 자리 올라감 (3.31.0, 3.32.0 ...)
# - 중간 규모 변경은 수동으로 MANUAL_MINOR_BUMP=1 환경변수 주면 MINOR +1
MAJOR="3"
TOTAL_COMMITS="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
MINOR=$((TOTAL_COMMITS / 10))
PATCH=$((TOTAL_COMMITS % 10))
if [ "${MANUAL_MINOR_BUMP:-0}" = "1" ]; then
  MINOR=$((MINOR + 1))
  PATCH=0
fi
APP_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "📦 version=$APP_VERSION build=$BUILD_ID"
echo "🧪 Validating scene layout..."
node scripts/validate-scene.mjs
echo "🔨 Building... (build=$BUILD_ID)"
npx next build
# version.json에 빌드 ID 주입 (자동 리로드용)
echo "{\"build\":\"$BUILD_ID\",\"version\":\"$APP_VERSION\"}" > out/version.json
# Cloudflare Pages 20K 파일 한도 대응: 미사용 에셋 제거
echo "🧹 Pruning unused assets (CF Pages 20K limit)..."
rm -rf out/assets/pokemon_assets/sliced
rm -rf "out/assets/pokemon_assets/Pokemon/Front shiny"
rm -rf "out/assets/pokemon_assets/Pokemon/Back shiny"
rm -rf "out/assets/pokemon_assets/Pokemon/Icons shiny"
rm -rf "out/assets/pokemon_assets/Pokemon/Footprints"
rm -rf "out/assets/pokemon_assets/Characters/Followers shiny"
echo "   남은 파일 수: $(find out -type f | wc -l)"
echo "🚀 Deploying..."
wrangler pages deploy out --project-name company-hq --commit-message="deploy: $BUILD_ID" --skip-caching
echo "✅ Done! build=$BUILD_ID"
