#!/bin/bash
set -e

# Target paths
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

echo "Installing EmberNovels..."

# Create directories if they do not exist
mkdir -p "$BIN_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$ICON_DIR"

# Copy binary
if [ -f "EmberNovels" ]; then
    cp "EmberNovels" "$BIN_DIR/"
    chmod +x "$BIN_DIR/EmberNovels"
elif [ -f "dist/EmberNovels" ]; then
    cp "dist/EmberNovels" "$BIN_DIR/"
    chmod +x "$BIN_DIR/EmberNovels"
else
    echo "Error: EmberNovels binary not found in current directory or dist/"
    exit 1
fi

# Copy icon
if [ -f "icon.jpg" ]; then
    cp "icon.jpg" "$ICON_DIR/EmberNovels.jpg"
else
    echo "Warning: icon.jpg not found, skipping icon installation"
fi

# Copy and adjust desktop file
if [ -f "EmberNovels.desktop" ]; then
    cp "EmberNovels.desktop" "$APP_DIR/"
    # Update Exec and Icon paths to point to absolute local directories
    sed -i "s|Icon=EmberNovels|Icon=$ICON_DIR/EmberNovels.jpg|g" "$APP_DIR/EmberNovels.desktop"
    sed -i "s|Exec=EmberNovels|Exec=$BIN_DIR/EmberNovels|g" "$APP_DIR/EmberNovels.desktop"
    chmod +x "$APP_DIR/EmberNovels.desktop"
else
    echo "Error: EmberNovels.desktop not found"
    exit 1
fi

echo "EmberNovels installed successfully!"
echo "You can now find EmberNovels in your Applications menu."
