#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_ROOT=${1:-/Applications}
DESKTOP_ROOT=${2:-"$HOME/Desktop"}
APP_NAME="ADSB Radar Gateway.app"
APP_ID="com.captainseang.adsbradar.gateway-monitor"
BUILT_APP="$PROJECT_DIR/.build/$APP_NAME"
INSTALL_APP="$INSTALL_ROOT/$APP_NAME"
DESKTOP_LINK="$DESKTOP_ROOT/ADSB Radar Gateway"

"$SCRIPT_DIR/build-app.sh" >/dev/null
mkdir -p "$INSTALL_ROOT" "$DESKTOP_ROOT"

if [ -e "$INSTALL_APP" ]; then
  installed_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INSTALL_APP/Contents/Info.plist" 2>/dev/null || true)
  if [ "$installed_id" != "$APP_ID" ]; then
    echo "Refusing to replace unexpected application at $INSTALL_APP" >&2
    exit 1
  fi
  rm -rf "$INSTALL_APP"
fi

/usr/bin/ditto "$BUILT_APP" "$INSTALL_APP"

if [ -L "$DESKTOP_LINK" ]; then
  rm "$DESKTOP_LINK"
elif [ -e "$DESKTOP_LINK" ]; then
  echo "Refusing to replace non-symlink Desktop item at $DESKTOP_LINK" >&2
  exit 1
fi
ln -s "$INSTALL_APP" "$DESKTOP_LINK"

/usr/bin/codesign --verify --deep --strict "$INSTALL_APP"
echo "Installed: $INSTALL_APP"
echo "Desktop shortcut: $DESKTOP_LINK -> $INSTALL_APP"
