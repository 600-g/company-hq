#!/bin/bash
set -e
cd "$(dirname "$0")/ui"
BUILD_ID="$(git log --oneline -1 --format='%h' 2>/dev/null || date +%s)-$(date +%s)"
echo "🧪 Validating scene layout..."
node scripts/validate-scene.mjs
echo "🔨 Building... (build=$BUILD_ID)"
npx next build
# version.json에 빌드 ID 주입 (자동 리로드용)
echo "{\"build\":\"$BUILD_ID\"}" > out/version.json
# Cloudflare Pages 20K 파일 한도 대응: 미사용 sliced/ 폴더 제거
if [ -d "out/assets/pokemon_assets/sliced" ]; then
  echo "🧹 Removing unused sliced/ (CF Pages 20K limit)..."
  rm -rf out/assets/pokemon_assets/sliced
fi
echo "🚀 Deploying..."
wrangler pages deploy out --project-name company-hq --commit-message="deploy: $BUILD_ID"
echo "✅ Done! build=$BUILD_ID"
