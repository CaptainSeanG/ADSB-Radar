#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
OUTPUT_APP="$PROJECT_DIR/.build/ADSB Radar Gateway.app"
cd "$PROJECT_DIR"
swift build -c release
BIN_DIR=$(cd "$PROJECT_DIR" && swift build -c release --show-bin-path)

case "$OUTPUT_APP" in
  "$PROJECT_DIR"/.build/*) ;;
  *) echo "Refusing unexpected output path: $OUTPUT_APP" >&2; exit 1 ;;
esac

rm -rf "$OUTPUT_APP"
mkdir -p "$OUTPUT_APP/Contents/MacOS" "$OUTPUT_APP/Contents/Resources"
cp "$BIN_DIR/ADSB Radar Gateway" "$OUTPUT_APP/Contents/MacOS/ADSB Radar Gateway"
cp "$PROJECT_DIR/Resources/Info.plist" "$OUTPUT_APP/Contents/Info.plist"
codesign --force --sign - "$OUTPUT_APP"
echo "$OUTPUT_APP"
