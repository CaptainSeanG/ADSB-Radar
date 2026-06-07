import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 5173);

const ADSB_BASE_URL = process.env.ADSB_BASE_URL || "https://opendata.adsb.fi/api/v3";
const AIRPORTS_URL =
  process.env.AIRPORTS_URL || "https://davidmegginson.github.io/ourairports-data/airports.csv";

let airportsCache = null;
let airportsCacheTime = 0;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
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

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function parseAirportsCsv(csv) {
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const usefulTypes = new Set(["small_airport", "medium_airport", "large_airport"]);

  return lines
    .map((line) => {
      const row = parseCsvLine(line);
      const lat = parseNumber(row[index.latitude_deg]);
      const lon = parseNumber(row[index.longitude_deg]);
      const type = row[index.type];

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !usefulTypes.has(type)) {
        return null;
      }

      return {
        ident: row[index.ident],
        name: row[index.name],
        type,
        lat,
        lon,
        elevationFt: parseNumber(row[index.elevation_ft]),
        municipality: row[index.municipality],
        iata: row[index.iata_code]
      };
    })
    .filter(Boolean);
}

async function getAirports() {
  const maxAgeMs = 24 * 60 * 60 * 1000;
  if (airportsCache && Date.now() - airportsCacheTime < maxAgeMs) {
    return airportsCache;
  }

  const response = await fetch(AIRPORTS_URL, {
    headers: { "user-agent": "ADSB Plane Tracker Radar/0.1" }
  });

  if (!response.ok) {
    throw new Error(`Airport data returned ${response.status}`);
  }

  airportsCache = parseAirportsCsv(await response.text());
  airportsCacheTime = Date.now();
  return airportsCache;
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

async function handleAircraft(req, res, url) {
  const lat = parseNumber(url.searchParams.get("lat"));
  const lon = parseNumber(url.searchParams.get("lon"));
  const radiusMiles = parseNumber(url.searchParams.get("radiusMiles"), 20);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    jsonResponse(res, 400, { error: "lat and lon query parameters are required" });
    return;
  }

  const radiusNm = Math.max(1, Math.min(250, milesToNauticalMiles(radiusMiles)));
  const endpoint = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${radiusNm.toFixed(1)}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, br, deflate",
        "user-agent": "ADSB Plane Tracker Radar/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`adsb.fi returned ${response.status}`);
    }

    const data = await response.json();
    const aircraft = (data.ac || [])
      .map(normalizeAircraft)
      .filter(Boolean)
      .filter((plane) => distanceMiles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);

    jsonResponse(res, 200, {
      source: "adsb.fi",
      now: data.now || Date.now() / 1000,
      aircraft,
      total: aircraft.length
    });
  } catch (error) {
    jsonResponse(res, 502, {
      error: "Unable to fetch ADS-B data",
      detail: error.message,
      source: "adsb.fi"
    });
  }
}

async function handleAirports(req, res, url) {
  const lat = parseNumber(url.searchParams.get("lat"));
  const lon = parseNumber(url.searchParams.get("lon"));
  const radiusMiles = parseNumber(url.searchParams.get("radiusMiles"), 20);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    jsonResponse(res, 400, { error: "lat and lon query parameters are required" });
    return;
  }

  try {
    const airports = (await getAirports())
      .map((airport) => ({
        ...airport,
        distanceMiles: distanceMiles(lat, lon, airport.lat, airport.lon)
      }))
      .filter((airport) => airport.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 120);

    jsonResponse(res, 200, { source: "OurAirports", airports });
  } catch (error) {
    jsonResponse(res, 502, {
      error: "Unable to fetch airport data",
      detail: error.message,
      source: "OurAirports"
    });
  }
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const normalizedPath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/aircraft") {
    await handleAircraft(req, res, url);
    return;
  }

  if (url.pathname === "/api/airports") {
    await handleAirports(req, res, url);
    return;
  }

  await serveStatic(req, res, url);
}).listen(port, () => {
  console.log(`ADSB radar running at http://127.0.0.1:${port}`);
});
