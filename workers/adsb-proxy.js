const SOURCES = ["https://api.adsb.lol/v2", "https://opendata.adsb.fi/api/v3"];
const VERSION = "2026-06-07-short-worker-v1";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" }
  });

const num = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nm = (miles) => miles * 0.868976;

function miles(aLat, aLon, bLat, bLon) {
  const earth = 3958.7613;
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

function aircraft(raw) {
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    hex: raw.hex || raw.icao || "",
    nNumber: (raw.r || raw.reg || raw.registration || "").trim(),
    callsign: (raw.flight || raw.call || "").trim(),
    type: (raw.t || raw.type || "").trim(),
    lat,
    lon,
    altitude: raw.alt_baro ?? raw.alt_geom ?? raw.altitude ?? null,
    speed: raw.gs ?? raw.tas ?? raw.ias ?? null,
    track: raw.track ?? raw.true_heading ?? raw.nav_heading ?? null,
    verticalRate: raw.baro_rate ?? raw.geom_rate ?? null,
    seen: raw.seen ?? null,
    emergency: raw.emergency || null,
    category: raw.category || null
  };
}

async function handleAircraft(url) {
  const lat = num(url.searchParams.get("lat"));
  const lon = num(url.searchParams.get("lon"));
  const radiusMiles = num(url.searchParams.get("radiusMiles"), 15);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "lat and lon are required" }, 400);

  const failures = [];
  for (const base of SOURCES) {
    const endpoint = `${base}/lat/${lat}/lon/${lon}/dist/${Math.max(1, Math.min(250, nm(radiusMiles))).toFixed(1)}`;
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) {
        failures.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const list = (data.ac || [])
        .map(aircraft)
        .filter(Boolean)
        .filter((plane) => miles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);
      return json({ source: base, workerVersion: VERSION, now: data.now || Date.now() / 1000, aircraft: list, total: list.length });
    } catch (error) {
      failures.push(`${base}: ${error.message}`);
    }
  }
  return json({ error: "All ADS-B upstreams failed", detail: failures, workerVersion: VERSION }, 502);
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, workerVersion: VERSION });
    if (url.pathname === "/api/aircraft") return handleAircraft(url);
    return json({ error: "Not found", workerVersion: VERSION }, 404);
  }
};
