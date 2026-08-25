#!/bin/sh
set -eu

ACCOUNT=${1:-}
VALUE_FILE=${2:-}
SERVICE="com.captainseang.adsbradar.gateway-monitor"

case "$ACCOUNT" in
  tais-gateway-token|worker-admin-token) ;;
  *) echo "Usage: $0 tais-gateway-token|worker-admin-token /path/to/protected-token-file" >&2; exit 2 ;;
esac

if [ ! -r "$VALUE_FILE" ]; then
  echo "Protected token file is not readable." >&2
  exit 1
fi

TOKEN=$(tr -d '\r\n' < "$VALUE_FILE")
if [ -z "$TOKEN" ]; then
  echo "Protected token file is empty." >&2
  exit 1
fi

security add-generic-password -U -s "$SERVICE" -a "$ACCOUNT" -w "$TOKEN" >/dev/null
echo "Stored $ACCOUNT in macOS Keychain."
