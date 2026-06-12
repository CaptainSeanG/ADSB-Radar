# Raspberry Pi Zero 2 W SD Card Setup

This Pi runs two local services:

- `adsb-stratus-bridge.service`: listens for Stratus/GDL90 traffic and serves `http://pi-hostname.local:8787/api/aircraft`
- `adsb-radar.service`: serves the radar web app at `http://pi-hostname.local:5173`

## Flash The SD Card

Use Raspberry Pi Imager:

1. Choose **Raspberry Pi Zero 2 W**.
2. Choose **Raspberry Pi OS Lite (64-bit)** if available, otherwise Lite 32-bit is fine.
3. Open advanced settings.
4. Set hostname: `adsb-radar`
5. Enable SSH.
6. Set a username and password.
7. Configure WiFi for your normal home WiFi first. This lets the Pi install packages and pull updates.
8. Flash the card and boot the Pi.

## Install The Radar

SSH into the Pi while it is on home WiFi:

```bash
ssh your-user@adsb-radar.local
```

Clone and install:

```bash
git clone https://github.com/CaptainSeanG/ADSB-Radar.git
cd ADSB-Radar
bash pi/install.sh
```

Open:

```text
http://adsb-radar.local:5173
http://adsb-radar.local:8787/health
```

## Configure Stratus WiFi

After the install works on home WiFi, use Raspberry Pi OS networking to connect the Pi to the Stratus WiFi network.

With NetworkManager-based Raspberry Pi OS:

```bash
sudo nmcli device wifi list
sudo nmcli device wifi connect "STRATUS_WIFI_NAME"
```

If the Stratus network has a password:

```bash
sudo nmcli device wifi connect "STRATUS_WIFI_NAME" password "STRATUS_PASSWORD"
```

Then open the health page from a device also connected to the Stratus WiFi:

```text
http://adsb-radar.local:8787/health
```

You want to see `packetCount`, `frameCount`, and `trafficCount` increasing.

## Cockpit Use

1. Power on the Stratus.
2. Power on the Pi.
3. Connect the iPad/iPhone to the same Stratus WiFi network.
4. Open:

```text
http://adsb-radar.local:5173
```

The radar will prefer the local Stratus bridge and fall back to cellular only when the browser has internet access and the configured Cloudflare Worker is reachable.

When served from `adsb-radar.local`, the app automatically points its Stratus source at:

```text
http://adsb-radar.local:8787
```

## Useful Commands

```bash
sudo systemctl status adsb-radar
sudo systemctl status adsb-stratus-bridge
sudo journalctl -u adsb-stratus-bridge -f
sudo journalctl -u adsb-radar -f
sudo systemctl restart adsb-radar adsb-stratus-bridge
```
