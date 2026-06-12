#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_USER="${APP_USER:-$(id -un)}"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Could not find package.json in $APP_DIR" >&2
  exit 1
fi

echo "Installing system packages..."
sudo apt-get update
sudo apt-get install -y git nodejs npm avahi-daemon

echo "Preparing app in $APP_DIR..."
cd "$APP_DIR"
npm install --omit=dev

echo "Installing environment file..."
if [[ ! -f /etc/default/adsb-radar ]]; then
  sudo cp "$APP_DIR/pi/adsb-radar.env.example" /etc/default/adsb-radar
fi

echo "Installing systemd services..."
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__USER__#$APP_USER#g" "$APP_DIR/pi/adsb-radar.service" |
  sudo tee /etc/systemd/system/adsb-radar.service >/dev/null
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__USER__#$APP_USER#g" "$APP_DIR/pi/adsb-stratus-bridge.service" |
  sudo tee /etc/systemd/system/adsb-stratus-bridge.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable adsb-radar.service adsb-stratus-bridge.service
sudo systemctl restart adsb-radar.service adsb-stratus-bridge.service

HOSTNAME="$(hostname)"

echo
echo "ADS-B Radar Pi services installed."
echo "Radar:          http://$HOSTNAME.local:5173"
echo "Stratus health: http://$HOSTNAME.local:8787/health"
echo
echo "Service status:"
systemctl --no-pager --full status adsb-radar.service adsb-stratus-bridge.service || true
