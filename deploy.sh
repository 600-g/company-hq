#!/bin/bash
echo "🔨 Building..."
cd "$(dirname "$0")/ui" && npx next build
echo "🚀 Deploying..."
wrangler pages deploy out --project-name company-hq --commit-message="deploy: $(git log --oneline -1 --format='%h' 2>/dev/null || echo 'update')"
echo "✅ Done!"
