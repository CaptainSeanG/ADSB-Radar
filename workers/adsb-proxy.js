const SOURCES = ["https://api.adsb.lol/v2", "https://opendata.adsb.fi/api/v3"];
const VERSION = "2026-06-09-cache-worker-v2";
const FRESH_TTL_SECONDS = 7;
const UPSTREAM_TIMEOUT_MS = 6500;
const aircraftCache = new Map();

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

function cacheKey(lat, lon, radiusMiles) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}:${Math.round(radiusMiles * 10) / 10}`;
}

function ageSeconds(entry) {
  return Math.max(0, Math.round((Date.now() - entry.cachedAt) / 1000));
}

function withCacheMetadata(entry, stale) {
  return {
    ...entry.payload,
    stale,
    ageSeconds: ageSeconds(entry),
    cacheTtlSeconds: FRESH_TTL_SECONDS,
    workerVersion: VERSION
  };
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

async function fetchUpstream(base, lat, lon, radiusMiles) {
  const radiusNm = Math.max(1, Math.min(250, nm(radiusMiles))).toFixed(1);
  const endpoint = `${base}/lat/${lat}/lon/${lon}/dist/${radiusNm}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": "ADSB Radar Worker/2.0" },
      signal: controller.signal
    });
    console.log(`ADS-B upstream ${base} status ${response.status}`);

    if (!response.ok) {
      return { ok: false, status: response.status, detail: `${base}: HTTP ${response.status}` };
    }

    const data = await response.json();
    const list = (data.ac || [])
      .map(aircraft)
      .filter(Boolean)
      .filter((plane) => miles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);

    return {
      ok: true,
      payload: {
        source: base,
        now: data.now || Date.now() / 1000,
        aircraft: list,
        total: list.length
      }
    };
  } catch (error) {
    const detail = error?.name === "AbortError" ? `${base}: timeout` : `${base}: ${error?.message || error}`;
    console.log(`ADS-B upstream ${base} error ${detail}`);
    return { ok: false, status: "timeout", detail };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleAircraft(url) {
  const lat = num(url.searchParams.get("lat"));
  const lon = num(url.searchParams.get("lon"));
  const radiusMiles = num(url.searchParams.get("radiusMiles"), 15);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "lat and lon are required" }, 400);

  const key = cacheKey(lat, lon, radiusMiles);
  const cached = aircraftCache.get(key);
  if (cached && ageSeconds(cached) <= FRESH_TTL_SECONDS) {
    return json(withCacheMetadata(cached, false));
  }

  const failures = [];
  for (const base of SOURCES) {
    const result = await fetchUpstream(base, lat, lon, radiusMiles);
    if (!result.ok) {
      failures.push(result.detail);
      continue;
    }

    const entry = { payload: result.payload, cachedAt: Date.now() };
    aircraftCache.set(key, entry);
    return json(withCacheMetadata(entry, false));
  }

  if (cached) {
    console.log(`ADS-B serving stale cache for ${key}; failures: ${failures.join(" | ")}`);
    return json({
      ...withCacheMetadata(cached, true),
      warning: "ADS-B upstream unavailable; serving stale cached aircraft data.",
      upstreamFailures: failures
    });
  }

  return json({ error: "All ADS-B upstreams failed", detail: failures, stale: false, ageSeconds: null, workerVersion: VERSION }, 502);
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
