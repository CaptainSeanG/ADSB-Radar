#!/bin/sh
set -eu

ENV_FILE=${1:-"$HOME/Library/Application Support/ADSB Radar TAIS/gateway.env"}
JAR_PATH=${TAIS_GATEWAY_JAR:-"$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/gateway/tais/target/tais-gateway.jar"}
JAVA_BIN=${TAIS_GATEWAY_JAVA:-}

if [ -z "$JAVA_BIN" ] && [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
  JAVA_BIN=/opt/homebrew/opt/openjdk/bin/java
fi
if [ -z "$JAVA_BIN" ]; then
  JAVA_BIN=java
fi

if [ ! -r "$ENV_FILE" ]; then
  echo "TAIS gateway environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

set -a
# The environment file is mode 600 and lives outside git.
. "$ENV_FILE"
set +a

exec "$JAVA_BIN" -jar "$JAR_PATH"
