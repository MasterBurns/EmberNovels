#!/bin/bash
set -e

# Detect root / sudo for global vs local install
if [ "$EUID" -eq 0 ]; then
    echo "Installing EmberNovels system-wide (Global)..."
    BIN_DIR="/usr/bin"
    APP_DIR="/usr/share/applications"
    ICON_DIR="/usr/share/pixmaps"
    ICON_PATH="$ICON_DIR/EmberNovels.jpg"
else
    echo "Installing EmberNovels for current user (Local)..."
    BIN_DIR="$HOME/.local/bin"
    APP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
    ICON_PATH="$ICON_DIR/EmberNovels.jpg"
fi

# Create directories
mkdir -p "$BIN_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$ICON_DIR"

# Copy binary
SRC_BIN=""
if [ -f "EmberNovels" ]; then
    SRC_BIN="EmberNovels"
elif [ -f "dist/EmberNovels" ]; then
    SRC_BIN="dist/EmberNovels"
else
    echo "Error: EmberNovels binary not found."
    exit 1
fi

# Install primary binary
cp "$SRC_BIN" "$BIN_DIR/EmberNovels"
chmod +x "$BIN_DIR/EmberNovels"

# Create lowercase symlink
ln -sf "$BIN_DIR/EmberNovels" "$BIN_DIR/embernovels"

# Install icon
if [ -f "icon.jpg" ]; then
    cp "icon.jpg" "$ICON_PATH"
fi

# Install and configure desktop launcher
if [ -f "EmberNovels.desktop" ]; then
    cp "EmberNovels.desktop" "$APP_DIR/"
    # Enforce correct Exec and Icon paths
    sed -i "s|Icon=EmberNovels|Icon=$ICON_PATH|g" "$APP_DIR/EmberNovels.desktop"
    sed -i "s|Exec=EmberNovels|Exec=$BIN_DIR/embernovels|g" "$APP_DIR/EmberNovels.desktop"
    chmod +x "$APP_DIR/EmberNovels.desktop"
fi

# Refresh desktop database if utility is available
if command -v update-desktop-database &> /dev/null; then
    if [ "$EUID" -eq 0 ]; then
        update-desktop-database /usr/share/applications || true
    else
        update-desktop-database "$APP_DIR" || true
    fi
fi

echo "EmberNovels installed successfully!"
echo "You can now start the app by typing 'embernovels' in the terminal or opening it from your Applications menu."

# Warn user if local bin directory is not in their shell PATH
if [ "$EUID" -ne 0 ]; then
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *)
            echo ""
            echo "⚠️  HINWEIS: Das Verzeichnis '$BIN_DIR' ist nicht in deiner PATH-Variable enthalten!"
            echo "Du musst die App eventuell mit dem vollen Pfad starten:"
            echo "  $BIN_DIR/embernovels"
            echo "Oder füge '$BIN_DIR' zu deiner PATH-Variable in deiner Shell-Konfigurationsdatei (z.B. ~/.config/fish/config.fish oder ~/.bashrc) hinzu."
            ;;
    esac
fi
