#!/bin/bash

# Build a polished DMG installer for Terminal GUI
# Usage: bash scripts/build-dmg.sh

set -e

APP_NAME="Terminal GUI"
DMG_NAME="Terminal-GUI-Installer"
BUILD_DIR="build/stable-macos-arm64"
OUTPUT_DIR="artifacts"
BACKGROUND="public/dmg-background.png"

echo "Building Terminal GUI..."

# Build the app first
npm run build
bash scripts/electrobun.sh build --env=stable

echo "Creating polished DMG installer..."

# Remove old DMGs
rm -f "${OUTPUT_DIR}/${DMG_NAME}.dmg"
rm -f "${OUTPUT_DIR}/stable-macos-arm64-TerminalGUI.dmg"

# Create the polished DMG with create-dmg
create-dmg \
  --volname "${APP_NAME}" \
  --window-pos 200 120 \
  --window-size 660 400 \
  --background "${BACKGROUND}" \
  --icon-size 120 \
  --text-size 14 \
  --icon "${APP_NAME}.app" 180 200 \
  --hide-extension "${APP_NAME}.app" \
  --app-drop-link 480 200 \
  --no-internet-enable \
  "${OUTPUT_DIR}/${DMG_NAME}.dmg" \
  "${BUILD_DIR}/${APP_NAME}.app"

echo ""
echo "Done! DMG created at: ${OUTPUT_DIR}/${DMG_NAME}.dmg"
echo ""
echo "To test: open ${OUTPUT_DIR}/${DMG_NAME}.dmg"
