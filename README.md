# ADS-B Plane Tracker Radar

A laptop-friendly radar display that reads aircraft around a user-entered latitude and longitude, then renders them on a sweeping ATC-style scope.

## Features

- Live aircraft proxy for the `adsb.fi` open data endpoint.
- User-selectable ranges: 5, 10, 15, 20, 50, and 100 statute miles.
- Animated radar sweep that refreshes aircraft locations once per pass.
- Aircraft labels with registration/N-number when available, callsign, type, altitude, speed, and distance.
- Trend lines from recent positions.
- Nearby airport reference markers from OurAirports data.
- Demo fallback when live data or airport data is unavailable.
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

The static page tries to fetch `adsb.fi` and OurAirports directly from the browser. If a live data request is blocked by browser CORS rules or unavailable, the radar automatically switches to demo traffic. For guaranteed live traffic on a public web URL, deploy the included Node server or add a small hosted proxy.
