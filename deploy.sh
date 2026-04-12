#!/bin/bash
set -e
cd "$(dirname "$0")/ui"
BUILD_ID="$(git log --oneline -1 --format='%h' 2>/dev/null || date +%s)-$(date +%s)"
echo "🔨 Building... (build=$BUILD_ID)"
npx next build
# version.json에 빌드 ID 주입 (자동 리로드용)
echo "{\"build\":\"$BUILD_ID\"}" > out/version.json
echo "🚀 Deploying..."
wrangler pages deploy out --project-name company-hq --commit-message="deploy: $BUILD_ID"
echo "✅ Done! build=$BUILD_ID"
