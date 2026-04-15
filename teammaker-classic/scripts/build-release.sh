#!/bin/bash
set -e

# Load signing credentials
if [ -f .env.signing.local ]; then
  set -a && source .env.signing.local && set +a
else
  echo "❌ .env.signing.local not found"
  exit 1
fi

RELEASE_DIR="release"
VERSION=$(node -p "require('./package.json').version")
REPO="bag-full-of-shit/team-maker-releases"

echo "=== TeamMaker v${VERSION} Release Build ==="
echo ""

# Step 1: Win x64
echo "[1/6] Building Windows x64..."
npm run electron:build -- --win nsis --x64
mv "${RELEASE_DIR}/TeamMaker Setup ${VERSION}.exe" "${RELEASE_DIR}/TeamMaker-Setup-${VERSION}-x64.exe"
echo "✅ Windows x64 done"

# Step 2: Win arm64
echo "[2/6] Building Windows arm64..."
npm run electron:build -- --win nsis --arm64
mv "${RELEASE_DIR}/TeamMaker Setup ${VERSION}.exe" "${RELEASE_DIR}/TeamMaker-Setup-${VERSION}-arm64.exe"
echo "✅ Windows arm64 done"

# Step 3: Mac (last — preserves signing)
echo "[3/6] Building macOS..."
npm run electron:build -- --mac
echo "✅ macOS done (app signed + notarized by electron-builder)"

# Step 4: Sign DMG
DMG="${RELEASE_DIR}/TeamMaker-${VERSION}-arm64.dmg"
echo "[4/6] Signing DMG..."
codesign -s "Developer ID Application: seungwook seo (Y6M44N2QCD)" "${DMG}"
echo "✅ DMG signed"

# Step 5: Notarize + staple DMG
echo "[5/6] Notarizing DMG (this takes 5-15 min)..."
xcrun notarytool submit "${DMG}" \
  --apple-id "${APPLE_ID}" \
  --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
  --team-id "${APPLE_TEAM_ID}" \
  --wait
xcrun stapler staple "${DMG}"
echo "✅ DMG notarized + stapled"

# Step 6: Upload
echo "[6/6] Uploading to ${REPO}..."
gh release upload "v${VERSION}" -R "${REPO}" \
  "${DMG}" \
  "${RELEASE_DIR}/TeamMaker-Setup-${VERSION}-x64.exe" \
  "${RELEASE_DIR}/TeamMaker-Setup-${VERSION}-arm64.exe" \
  "${RELEASE_DIR}/latest-mac.yml" \
  "${RELEASE_DIR}/latest.yml" \
  --clobber
echo "✅ Upload complete"

echo ""
echo "=== Release v${VERSION} done ==="
echo "https://github.com/${REPO}/releases/tag/v${VERSION}"
