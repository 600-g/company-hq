#!/bin/bash
echo "🔨 Building..."
cd "$(dirname "$0")/ui" && npx next build
echo "🚀 Deploying..."
wrangler pages deploy out --project-name company-hq --commit-dirty=true
echo "✅ Done!"
