#!/bin/bash
echo "============================================"
echo "  IT Stock - Build Installer"
echo "============================================"
echo

cd "$(dirname "$0")"

echo "[1/3] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error installing dependencies!"
    exit 1
fi

echo
echo "[2/3] Building installer..."
npm run build:win
if [ $? -ne 0 ]; then
    echo "Error building!"
    exit 1
fi

echo
echo "[3/3] Build complete!"
echo "Output folder: ../dist"
ls -la ../dist/*.exe 2>/dev/null || ls -la ../dist/*.AppImage 2>/dev/null
echo
