const ADSB_BASE_URL = "https://opendata.adsb.fi/api/v3";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function parseNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function milesToNauticalMiles(miles) {
  return miles * 0.868976;
}

function distanceMiles(latA, lonA, latB, lonB) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

function normalizeAircraft(raw) {
  const lat = parseNumber(raw.lat);
  const lon = parseNumber(raw.lon);
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
  const lat = parseNumber(url.searchParams.get("lat"));
  const lon = parseNumber(url.searchParams.get("lon"));
  const radiusMiles = parseNumber(url.searchParams.get("radiusMiles"), 15);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return jsonResponse({ error: "lat and lon query parameters are required" }, 400);
  }

  const radiusNm = Math.max(1, Math.min(250, milesToNauticalMiles(radiusMiles)));
  const endpoint = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${radiusNm.toFixed(1)}`;
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "ADSB Radar Cloudflare Worker"
    }
  });

  if (!response.ok) {
    return jsonResponse({ error: `adsb.fi returned ${response.status}` }, 502);
  }

  const data = await response.json();
  const aircraft = (data.ac || [])
    .map(normalizeAircraft)
    .filter(Boolean)
    .filter((plane) => distanceMiles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);

  return jsonResponse({
    source: "adsb.fi worker",
    now: data.now || Date.now() / 1000,
    aircraft,
    total: aircraft.length
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/aircraft") {
      return handleAircraft(url);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
};
