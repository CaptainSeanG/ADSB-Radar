# ADS-B Plane Tracker Radar

A laptop-friendly radar display that reads aircraft around a user-entered latitude and longitude, then renders them on a sweeping ATC-style scope.

## Features

- Live aircraft proxy for the `adsb.fi` open data endpoint.
- User-selectable ranges: 5, 10, 15, 20, 50, and 100 statute miles.
- Animated radar sweep that refreshes aircraft locations once per pass.
- Aircraft labels with registration/N-number when available, callsign, type, altitude, speed, and distance.
- Trend lines from recent positions.
- Nearby airport reference markers from OurAirports data.
- Toggleable FAA Class B, C, and D airspace overlays.
- Airport selector that can fill coordinates for known airports.
- No third-party npm dependencies, which keeps the Raspberry Pi path straightforward.

## Run

```powershell
node server.js
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173).

If port `5173` is busy:

```powershell
$env:PORT=5174; node server.js
```

## Data Notes

The app treats the user-facing range as statute miles and converts it to nautical miles for the `adsb.fi` query. The default ADS-B endpoint is:

```text
https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{dist_nm}
```

You can override it with:

```powershell
$env:ADSB_BASE_URL="https://opendata.adsb.fi/api/v3"; node server.js
```

Airport data is fetched from OurAirports and cached in memory for 24 hours.

Class B/C/D airspace overlays are fetched from the FAA ArcGIS `Class_Airspace` feature service and are intended for situational awareness only.

## Publish as a Web Page

This repo includes a root `index.html` so it can run from GitHub Pages without the Node server.

In GitHub:

1. Open the repository settings.
2. Go to **Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Pick branch `main` and folder `/root`.
5. Save.

The page will be available at:

```text
https://captainseang.github.io/ADSB-Radar/
```

The static page can fetch OurAirports directly from the browser, but live `adsb.fi` aircraft data needs a tiny proxy because `adsb.fi` does not send browser CORS headers.

## Live Data Proxy

The repo includes a Cloudflare Worker proxy at `workers/adsb-proxy.js`.

To enable live traffic on GitHub Pages:

1. Create a Cloudflare Worker.
2. Paste in the contents of `workers/adsb-proxy.js`.
3. Deploy it and copy the Worker URL.
4. Put that URL in `public/config.js`:

```js
window.ADSB_RADAR_PROXY_URL = "https://your-worker-name.your-account.workers.dev";
```

You can also test a proxy without editing the repo by opening:

```text
https://captainseang.github.io/ADSB-Radar/?proxy=https://your-worker-name.your-account.workers.dev
```

The app remembers that proxy URL in the browser after the first visit.

## Traffic Source Priority

The browser app can use a local Stratus bridge when one is available, then fall back to the Cloudflare Worker internet feed.

Set the bridge URL in `public/config.js`:

```js
window.ADSB_RADAR_STRATUS_URL = "http://127.0.0.1:8787";
```

Or test it without editing files:

```text
https://captainseang.github.io/ADSB-Radar/?stratus=http://127.0.0.1:8787
```

When the bridge responds, the app labels traffic source as `Stratus`. If it does not respond, the radar falls back to the Worker and labels traffic source as `Cellular`.

A normal browser page cannot listen directly to Stratus WiFi/UDP traffic, so the Stratus bridge must run locally on the laptop or Raspberry Pi and expose compatible `/api/aircraft` JSON.

## Stratus Bridge

The repo includes a first-pass Stratus bridge at `stratus-bridge.js`. It listens for GDL90 traffic on common UDP ports `4000`, `4001`, and `43211`, then exposes the radar-compatible aircraft endpoint on HTTP port `8787`.

For Raspberry Pi Zero 2 W setup, see `pi/README.md`.

Run it while connected to the Stratus WiFi:

```powershell
npm run stratus
```

Then open the health page:

```text
http://127.0.0.1:8787/health
```

If `packetCount` increases, the laptop is hearing the Stratus. If `trafficCount` increases, the bridge is decoding traffic reports. The `portStats` object shows which UDP port is receiving packets.

Point the radar at it with:

```text
https://captainseang.github.io/ADSB-Radar/?stratus=http://127.0.0.1:8787
```

On another device, replace `127.0.0.1` with the laptop or Raspberry Pi IP address on the same network.

Optional ports:

```powershell
$env:STRATUS_GDL90_PORTS="4000,4001,43211"
$env:STRATUS_BRIDGE_HTTP_PORT=8787
npm run stratus
```
