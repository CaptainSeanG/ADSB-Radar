const canvas = document.querySelector("#radar");
const ctx = canvas.getContext("2d");
const shell = document.querySelector(".shell");
const form = document.querySelector("#controls");
const panelToggle = document.querySelector("#panelToggle");
const airportSelect = document.querySelector("#airportSelect");
const coordRow = document.querySelector("#coordRow");
const latInput = document.querySelector("#lat");
const lonInput = document.querySelector("#lon");
const rangeButtons = document.querySelector("#rangeButtons");
const airspaceToggles = document.querySelector("#airspaceToggles");
const settingsOpen = document.querySelector("#settingsOpen");
const settingsClose = document.querySelector("#settingsClose");
const settingsModal = document.querySelector("#settingsModal");
const breadcrumbLengthInput = document.querySelector("#breadcrumbLength");
const breadcrumbReadout = document.querySelector("#breadcrumbReadout");
const groundTrafficToggle = document.querySelector("#groundTrafficToggle");
const radarDataToggle = document.querySelector("#radarDataToggle");
const precipitationToggle = document.querySelector("#precipitationToggle");
const sweepColorToggle = document.querySelector("#sweepColorToggle");
const aircraftModal = document.querySelector("#aircraftModal");
const aircraftClose = document.querySelector("#aircraftClose");
const aircraftDetail = document.querySelector("#aircraftDetail");
const statusEl = document.querySelector("#status");
const lastUpdateEl = document.querySelector("#lastUpdate");
const aircraftListEl = document.querySelector("#aircraftList");

const sweepSeconds = 4.2;
const allowedRanges = [2, 5, 10, 15, 20, 50, 100];
const sweepPalettes = {
  green: {
    trail: "77, 255, 155",
    line: "rgba(148, 255, 199, 0.96)"
  },
  orange: {
    trail: "255, 155, 64",
    line: "rgba(255, 180, 92, 0.96)"
  }
};
const adsbBaseUrl = "https://opendata.adsb.fi/api/v3";
const airportsCsvUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const weatherMapsUrl = "https://api.rainviewer.com/public/weather-maps.json";
const airspaceQueryUrl =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query";
const aircraftLookupBaseUrl = "https://api.adsbdb.com/v0/aircraft";
const proxyUrlFromQuery = new URLSearchParams(window.location.search).get("proxy");
if (proxyUrlFromQuery) {
  window.localStorage.setItem("ADSB_RADAR_PROXY_URL", proxyUrlFromQuery);
}
const adsbProxyBaseUrl = (
  proxyUrlFromQuery ||
  window.localStorage.getItem("ADSB_RADAR_PROXY_URL") ||
  window.ADSB_RADAR_PROXY_URL ||
  ""
).replace(/\/$/, "");
const tracks = new Map();
const aircraftTypeCache = new Map();
const kdvtFallbackCenter = { lat: 33.6883, lon: -112.083 };

let center = { lat: 33.7292, lon: -111.9918 };
let radiusMiles = 10;
let breadcrumbLimit = 12;
let sweepColor = "orange";
let showGroundTraffic = false;
let showRadarData = true;
let showPrecipitation = false;
let aircraft = [];
let airports = [];
let airspaces = [];
let running = true;
let lastSweepBucket = -1;
let lastFetchAt = 0;
let lastDataSource = "standby";
let pixelRatio = window.devicePixelRatio || 1;
let airportsCachePromise = null;
let lastAirspaceKey = "";
let aircraftHitAreas = [];
let gpsWatchId = null;
let gpsActive = false;
let weatherMeta = null;
let weatherMetaFetchedAt = 0;
let weatherImage = null;
let weatherImageKey = "";
let weatherImageLoading = false;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function updatePanelToggle() {
  const collapsed = shell.classList.contains("panel-collapsed");
  panelToggle.setAttribute("aria-label", collapsed ? "Show panel" : "Hide panel");
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
}

function milesBetween(latA, lonA, latB, lonB) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

function milesToNauticalMiles(miles) {
  return miles * 0.868976;
}

function parseNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function bearingDegrees(latA, lonA, latB, lonB) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const phiA = toRad(latA);
  const phiB = toRad(latB);
  const lambda = toRad(lonB - lonA);
  const y = Math.sin(lambda) * Math.cos(phiB);
  const x =
    Math.cos(phiA) * Math.sin(phiB) -
    Math.sin(phiA) * Math.cos(phiB) * Math.cos(lambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function project(lat, lon, scope) {
  const distance = milesBetween(center.lat, center.lon, lat, lon);
  const bearing = bearingDegrees(center.lat, center.lon, lat, lon);
  const angle = ((bearing - 90) * Math.PI) / 180;
  const radius = (distance / radiusMiles) * scope.radius;

  return {
    x: scope.cx + Math.cos(angle) * radius,
    y: scope.cy + Math.sin(angle) * radius,
    distance,
    bearing
  };
}

function formatAltitude(value) {
  if (value === "ground") return "GROUND";
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number).toLocaleString()}'` : "ALT ?";
}

function formatSpeed(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} kt` : "SPD ?";
}

function formatAirspaceAltitude(value, code) {
  if (code === "SFC" || Number(value) === 0) return "SFC";
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number / 100)) : "?";
}

function getVisibleAirspaceClasses() {
  return new Set(
    Array.from(airspaceToggles.querySelectorAll("input[data-class]:checked")).map((input) => input.dataset.class)
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function planeLabel(plane) {
  return plane.nNumber || plane.callsign || plane.hex || "Unknown";
}

function aircraftType(plane) {
  return plane.type || plane.resolvedType || "";
}

function aircraftDisplayLabel(plane) {
  const type = aircraftType(plane);
  const ident = planeLabel(plane);
  return type ? `${type} ${ident}` : ident;
}

function isGroundTraffic(plane) {
  return plane.altitude === "ground";
}

function visibleAircraft() {
  return showGroundTraffic ? aircraft : aircraft.filter((plane) => !isGroundTraffic(plane));
}

function aircraftKey(plane) {
  return plane.hex || plane.nNumber || plane.callsign || `${plane.lat},${plane.lon}`;
}

function needsTypeLookup(plane) {
  const type = aircraftType(plane).trim().toUpperCase();
  return plane.nNumber && (!type || type === "TYPE ?" || type === "UNKNOWN");
}

async function lookupAircraftType(nNumber) {
  const registration = nNumber.trim().toUpperCase();
  if (!registration) return "";
  if (aircraftTypeCache.has(registration)) return aircraftTypeCache.get(registration);

  const lookupPromise = fetch(`${aircraftLookupBaseUrl}/${encodeURIComponent(registration)}`, {
    headers: { accept: "application/json" }
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      const record = payload?.response?.aircraft || payload?.response || {};
      return record.icao_type || record.type || "";
    })
    .catch(() => "");

  aircraftTypeCache.set(registration, lookupPromise);
  const resolvedType = await lookupPromise;
  aircraftTypeCache.set(registration, resolvedType);
  return resolvedType;
}

async function resolveMissingAircraftTypes(nextAircraft) {
  const lookups = nextAircraft.filter(needsTypeLookup).map(async (plane) => {
    const resolvedType = await lookupAircraftType(plane.nNumber);
    if (resolvedType && needsTypeLookup(plane)) {
      plane.resolvedType = resolvedType;
      if (!plane.type || plane.type.trim().toUpperCase() === "UNKNOWN") {
        plane.type = resolvedType;
      }
    }
  });

  if (!lookups.length) return;
  await Promise.allSettled(lookups);
  renderList();
}

function updateTrackHistory(nextAircraft) {
  const now = Date.now();
  const seenKeys = new Set();

  for (const plane of nextAircraft) {
    const key = plane.hex || plane.nNumber || plane.callsign;
    if (!key) continue;
    seenKeys.add(key);

    const history = tracks.get(key) || [];
    const last = history.at(-1);
    if (!last || Math.abs(last.lat - plane.lat) > 0.0001 || Math.abs(last.lon - plane.lon) > 0.0001) {
      history.push({ lat: plane.lat, lon: plane.lon, at: now });
    }
    tracks.set(key, history.slice(-breadcrumbLimit));
  }

  for (const [key, history] of tracks.entries()) {
    const latest = history.at(-1);
    if (!seenKeys.has(key) && latest && now - latest.at > 10 * 60 * 1000) {
      tracks.delete(key);
    }
  }
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function fetchLocalTraffic(params) {
  const [trafficData, airportData] = await Promise.all([
    getJson(`./api/aircraft?${params}`),
    getJson(`./api/airports?${params}`)
  ]);

  return {
    aircraft: trafficData.aircraft || [],
    airports: airportData.airports || [],
    source: "adsb.fi"
  };
}

async function loadAirportCache() {
  if (!airportsCachePromise) {
    airportsCachePromise = fetch(airportsCsvUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Airport data returned ${response.status}`);
        return response.text();
      })
      .then(parseAirportsCsv);
  }

  return airportsCachePromise;
}

async function fetchStaticTraffic() {
  const radiusNm = Math.max(1, Math.min(250, milesToNauticalMiles(radiusMiles)));
  const adsbUrl = `${adsbBaseUrl}/lat/${center.lat}/lon/${center.lon}/dist/${radiusNm.toFixed(1)}`;
  const aircraftUrl = adsbProxyBaseUrl
    ? `${adsbProxyBaseUrl}/api/aircraft?lat=${center.lat}&lon=${center.lon}&radiusMiles=${radiusMiles}`
    : adsbUrl;

  const [trafficResponse, airportRows] = await Promise.all([
    fetch(aircraftUrl, {
      headers: {
        accept: "application/json"
      }
    }),
    loadAirportCache()
  ]);

  if (!trafficResponse.ok) {
    throw new Error(`aircraft feed returned ${trafficResponse.status}`);
  }

  const trafficData = await trafficResponse.json();
  const aircraftRows = adsbProxyBaseUrl
    ? trafficData.aircraft || []
    : (trafficData.ac || [])
        .map(normalizeAircraft)
        .filter(Boolean)
        .filter((plane) => milesBetween(center.lat, center.lon, plane.lat, plane.lon) <= radiusMiles + 1);

  const airportMatches = airportRows
    .map((airport) => ({
      ...airport,
      distanceMiles: milesBetween(center.lat, center.lon, airport.lat, airport.lon)
    }))
    .filter((airport) => airport.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 120);

  return {
    aircraft: aircraftRows,
    airports: airportMatches,
    source: adsbProxyBaseUrl ? "adsb.fi proxy" : "adsb.fi web"
  };
}

function airspaceEnvelope() {
  const latPad = radiusMiles / 69 + 0.08;
  const lonPad = radiusMiles / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180))) + 0.08;
  return `${center.lon - lonPad},${center.lat - latPad},${center.lon + lonPad},${center.lat + latPad}`;
}

function weatherZoomLevel() {
  const tileSpanMiles = Math.max(4, radiusMiles * 2.2);
  const earthMiles = 24901;
  const zoom = Math.round(Math.log2((earthMiles * Math.cos((center.lat * Math.PI) / 180)) / tileSpanMiles));
  return Math.max(4, Math.min(10, zoom));
}

async function loadWeatherMeta() {
  const now = Date.now();
  if (weatherMeta && now - weatherMetaFetchedAt < 5 * 60 * 1000) return weatherMeta;

  const response = await fetch(weatherMapsUrl);
  if (!response.ok) throw new Error(`weather radar returned ${response.status}`);
  weatherMeta = await response.json();
  weatherMetaFetchedAt = now;
  return weatherMeta;
}

async function ensureWeatherImage() {
  if (!showPrecipitation || weatherImageLoading) return;

  try {
    const meta = await loadWeatherMeta();
    const frame = meta.radar?.past?.at(-1);
    if (!frame?.path || !meta.host) return;

    const zoom = weatherZoomLevel();
    const key = `${frame.path}:${zoom}:${center.lat.toFixed(3)}:${center.lon.toFixed(3)}`;
    if (key === weatherImageKey && weatherImage) return;

    weatherImageLoading = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      weatherImage = image;
      weatherImageKey = key;
      weatherImageLoading = false;
    };
    image.onerror = () => {
      weatherImageLoading = false;
    };
    image.src = `${meta.host}${frame.path}/512/${zoom}/${center.lat.toFixed(4)}/${center.lon.toFixed(4)}/2/1_1.png`;
  } catch (error) {
    weatherImageLoading = false;
    console.warn("Unable to load precipitation layer", error);
  }
}

function drawPrecipitation(scope) {
  if (!showPrecipitation) return;
  ensureWeatherImage();
  if (!weatherImage) return;

  const size = scope.radius * 2.18;
  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(weatherImage, scope.cx - size / 2, scope.cy - size / 2, size, size);
  ctx.restore();
}

function updateCenter(lat, lon, { clearTracks = true, source = "manual" } = {}) {
  center = { lat, lon };
  latInput.value = lat.toFixed(4);
  lonInput.value = lon.toFixed(4);
  if (clearTracks) tracks.clear();
  lastAirspaceKey = "";
  weatherImageKey = "";
  statusEl.textContent =
    source === "gps"
      ? `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`
      : "Radar sweep active. Updating aircraft every pass.";
  fetchAirspace();
  fetchTraffic();
}

function normalizeAirspaceFeature(feature) {
  const attributes = feature.attributes || {};
  const rings = (feature.geometry?.rings || []).map((ring) => ring.map(([lon, lat]) => ({ lat, lon })));
  if (!rings.length || !attributes.CLASS) return null;

  return {
    id: attributes.OBJECTID,
    ident: attributes.IDENT || attributes.ICAO_ID || "",
    name: attributes.NAME || "",
    classCode: attributes.CLASS,
    sector: attributes.SECTOR || "",
    lower: formatAirspaceAltitude(attributes.LOWER_VAL, attributes.LOWER_CODE),
    upper: formatAirspaceAltitude(attributes.UPPER_VAL, attributes.UPPER_CODE),
    rings
  };
}

async function fetchAirspace() {
  const visibleClasses = getVisibleAirspaceClasses();
  if (!visibleClasses.size) {
    airspaces = [];
    lastAirspaceKey = "";
    return;
  }

  const key = `${center.lat.toFixed(4)},${center.lon.toFixed(4)},${radiusMiles}`;
  if (key === lastAirspaceKey && airspaces.length) return;

  const params = new URLSearchParams({
    f: "json",
    where: "TYPE_CODE='CLASS' AND CLASS in ('B','C','D')",
    outFields: "OBJECTID,IDENT,ICAO_ID,NAME,CLASS,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,SECTOR",
    geometry: airspaceEnvelope(),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    returnGeometry: "true",
    maxAllowableOffset: "0.0015",
    resultRecordCount: "120"
  });

  try {
    const data = await getJson(`${airspaceQueryUrl}?${params}`);
    airspaces = (data.features || []).map(normalizeAirspaceFeature).filter(Boolean);
    lastAirspaceKey = key;
  } catch (error) {
    airspaces = [];
    console.warn("Unable to fetch FAA airspace boundaries", error);
  }
}

async function fetchTraffic() {
  const params = new URLSearchParams({
    lat: center.lat,
    lon: center.lon,
    radiusMiles
  });

  try {
    const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
    const data = localHostnames.has(window.location.hostname)
      ? await fetchLocalTraffic(params).catch(() => fetchStaticTraffic())
      : await fetchStaticTraffic();

    aircraft = data.aircraft;
    airports = data.airports;
    lastDataSource = data.source;
    statusEl.textContent = gpsActive
      ? `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`
      : `Live ADS-B feed active for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;
    resolveMissingAircraftTypes(aircraft);
  } catch (error) {
    aircraft = [];
    airports = [];
    lastDataSource = "offline";
    const proxyHint = adsbProxyBaseUrl ? "" : " A live web page needs the ADS-B proxy URL configured.";
    statusEl.textContent = `Live data unavailable: ${error.message}.${proxyHint}`;
  }

  updateTrackHistory(aircraft);
  lastFetchAt = Date.now();
  renderList();
}

function renderList() {
  lastUpdateEl.textContent = lastFetchAt
    ? new Date(lastFetchAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "No sweep yet";

  const sorted = visibleAircraft()
    .map((plane) => ({
      ...plane,
      distance: milesBetween(center.lat, center.lon, plane.lat, plane.lon)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);

  aircraftListEl.innerHTML = sorted
    .map(
      (plane) => `
        <li>
          <button type="button" class="aircraft-row" data-aircraft-key="${escapeHtml(aircraftKey(plane))}">
          <div class="plane-head">
            <span>${escapeHtml(aircraftDisplayLabel(plane))}</span>
            <span>${escapeHtml(aircraftType(plane) || "TYPE ?")}</span>
          </div>
          <div class="plane-meta">
            <span>${formatAltitude(plane.altitude)}</span>
            <span>${formatSpeed(plane.speed)}</span>
            <span>${plane.distance.toFixed(1)} mi</span>
          </div>
          </button>
        </li>
      `
    )
    .join("");
}

function drawGrid(scope) {
  ctx.save();
  ctx.translate(scope.cx, scope.cy);
  ctx.strokeStyle = "rgba(90, 255, 163, 0.22)";
  ctx.lineWidth = 1;

  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, (scope.radius * ring) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let spoke = 0; spoke < 12; spoke += 1) {
    const angle = (spoke / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * scope.radius, Math.sin(angle) * scope.radius);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(98, 213, 255, 0.38)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, scope.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(233, 255, 243, 0.72)";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -scope.radius - 14);
  ctx.fillText("S", 0, scope.radius + 24);
  ctx.fillText("E", scope.radius + 18, 4);
  ctx.fillText("W", -scope.radius - 18, 4);
  ctx.restore();
}

function drawAirports(scope) {
  ctx.save();
  ctx.font = "700 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  for (const airport of airports) {
    const point = project(airport.lat, airport.lon, scope);
    if (point.distance > radiusMiles) continue;

    ctx.strokeStyle = airport.type === "large_airport" ? "rgba(255, 207, 106, 0.95)" : "rgba(255, 207, 106, 0.58)";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(point.x - 6, point.y);
    ctx.lineTo(point.x + 6, point.y);
    ctx.moveTo(point.x, point.y - 6);
    ctx.lineTo(point.x, point.y + 6);
    ctx.stroke();
    if (showRadarData) {
      ctx.fillText(airport.ident || airport.iata, point.x + 9, point.y - 8);
    }
  }
  ctx.restore();
}

function drawAirspace(scope) {
  const visibleClasses = getVisibleAirspaceClasses();
  if (!visibleClasses.size || !airspaces.length) return;

  const styles = {
    B: { stroke: "rgba(87, 185, 255, 0.92)", fill: "rgba(87, 185, 255, 0.06)", dash: [] },
    C: { stroke: "rgba(105, 224, 255, 0.78)", fill: "rgba(105, 224, 255, 0.045)", dash: [10, 7] },
    D: { stroke: "rgba(151, 166, 255, 0.82)", fill: "rgba(151, 166, 255, 0.04)", dash: [4, 7] }
  };

  ctx.save();
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.lineWidth = 2;

  for (const airspace of airspaces) {
    if (!visibleClasses.has(airspace.classCode)) continue;
    const style = styles[airspace.classCode] || styles.D;
    const labelPoints = [];

    ctx.strokeStyle = style.stroke;
    ctx.fillStyle = style.fill;
    ctx.setLineDash(style.dash);

    for (const ring of airspace.rings) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ring.forEach((point, index) => {
        const projected = project(point.lat, point.lon, scope);
        labelPoints.push(projected);
        if (index === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const inScope = labelPoints.filter((point) => point.distance <= radiusMiles * 1.05);
    if (showRadarData && inScope.length) {
      const labelPoint = inScope[Math.floor(inScope.length / 2)];
      ctx.setLineDash([]);
      ctx.fillStyle = style.stroke;
      ctx.fillText(
        `${airspace.classCode} ${airspace.lower}/${airspace.upper}`,
        Math.min(scope.width - 76, Math.max(8, labelPoint.x + 5)),
        Math.min(scope.height - 12, Math.max(18, labelPoint.y - 5))
      );
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawTrack(scope, plane) {
  const key = plane.hex || plane.nNumber || plane.callsign;
  const history = tracks.get(key) || [];
  if (history.length < 2) return;

  ctx.save();
  ctx.strokeStyle = Number(plane.altitude) > 18000 ? "rgba(255, 80, 92, 0.7)" : "rgba(98, 213, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  history.forEach((sample, index) => {
    const point = project(sample.lat, sample.lon, scope);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawAircraft(scope) {
  ctx.save();
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  aircraftHitAreas = [];

  for (const plane of visibleAircraft()) {
    const point = project(plane.lat, plane.lon, scope);
    if (point.distance > radiusMiles) continue;

    aircraftHitAreas.push({ key: aircraftKey(plane), x: point.x, y: point.y, plane });
    drawTrack(scope, plane);

    const heading = Number.isFinite(Number(plane.track)) ? ((Number(plane.track) - 90) * Math.PI) / 180 : -Math.PI / 2;
    ctx.translate(point.x, point.y);
    ctx.rotate(heading);
    ctx.fillStyle = plane.emergency && plane.emergency !== "none" ? "#ff6a75" : "#e9fff3";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-heading);
    ctx.translate(-point.x, -point.y);

    ctx.fillStyle = "rgba(233, 255, 243, 0.92)";
    if (showRadarData) {
      ctx.fillText(aircraftDisplayLabel(plane), point.x + 13, point.y - 11);
      ctx.fillStyle = "rgba(77, 255, 155, 0.86)";
      ctx.fillText(`${formatAltitude(plane.altitude)} ${formatSpeed(plane.speed)}`, point.x + 13, point.y + 4);
    }
  }

  ctx.restore();
}

function drawSweep(scope, angle) {
  const trailSegments = 28;
  const trailWidth = 1.35;
  const palette = sweepPalettes[sweepColor] || sweepPalettes.green;
  ctx.save();
  ctx.translate(scope.cx, scope.cy);

  for (let index = 0; index < trailSegments; index += 1) {
    const progress = index / trailSegments;
    const segmentAngle = angle - progress * trailWidth;
    const alpha = (1 - progress) ** 2 * 0.2;
    const innerRadius = scope.radius * 0.04;

    ctx.beginPath();
    ctx.moveTo(Math.cos(segmentAngle) * innerRadius, Math.sin(segmentAngle) * innerRadius);
    ctx.arc(0, 0, scope.radius, segmentAngle - 0.026, segmentAngle + 0.026);
    ctx.closePath();
    ctx.fillStyle = `rgba(${palette.trail}, ${alpha})`;
    ctx.fill();
  }

  ctx.rotate(angle);

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(scope.radius, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHud(scope) {
  ctx.save();
  ctx.fillStyle = "rgba(233, 255, 243, 0.75)";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${visibleAircraft().length} TRACKS`, scope.width - 22, 28);
  ctx.fillText(`${airports.length} AIRPORTS`, scope.width - 22, 48);
  ctx.restore();
}

function render(now) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scope = {
    width,
    height,
    cx: width / 2,
    cy: height / 2,
    radius: Math.max(80, Math.min(width, height) * 0.43)
  };

  const sweepProgress = ((now / 1000) % sweepSeconds) / sweepSeconds;
  const sweepBucket = Math.floor(now / (sweepSeconds * 1000));
  const angle = sweepProgress * Math.PI * 2 - Math.PI / 2;

  if (running && sweepBucket !== lastSweepBucket) {
    lastSweepBucket = sweepBucket;
    fetchTraffic();
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020503";
  ctx.fillRect(0, 0, width, height);

  drawGrid(scope);
  drawPrecipitation(scope);
  drawAirspace(scope);
  drawAirports(scope);
  drawAircraft(scope);
  drawSweep(scope, angle);
  if (showRadarData) drawHud(scope);

  requestAnimationFrame(render);
}

function setRange(nextRange) {
  radiusMiles = allowedRanges.includes(nextRange) ? nextRange : 20;
  weatherImageKey = "";
  for (const button of rangeButtons.querySelectorAll("button")) {
    button.classList.toggle("active", Number(button.dataset.range) === radiusMiles);
  }
}

rangeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  setRange(Number(button.dataset.range));
  fetchAirspace();
  fetchTraffic();
});

airspaceToggles.addEventListener("change", () => {
  if (!getVisibleAirspaceClasses().size) {
    airspaces = [];
    lastAirspaceKey = "";
    return;
  }

  fetchAirspace();
});

function openSettings() {
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

function openAircraftDetails(plane) {
  if (!plane) return;
  const distance = milesBetween(center.lat, center.lon, plane.lat, plane.lon);
  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);
  aircraftDetail.innerHTML = `
    <div class="detail-title">${escapeHtml(aircraftDisplayLabel(plane))}</div>
    <dl>
      <div><dt>Type</dt><dd>${escapeHtml(aircraftType(plane) || "Unknown")}</dd></div>
      <div><dt>Callsign</dt><dd>${escapeHtml(plane.callsign || "Unknown")}</dd></div>
      <div><dt>ICAO</dt><dd>${escapeHtml(plane.hex || "Unknown")}</dd></div>
      <div><dt>Altitude</dt><dd>${formatAltitude(plane.altitude)}</dd></div>
      <div><dt>Speed</dt><dd>${formatSpeed(plane.speed)}</dd></div>
      <div><dt>Track</dt><dd>${Number.isFinite(Number(plane.track)) ? `${Math.round(Number(plane.track))} deg` : "Unknown"}</dd></div>
      <div><dt>Distance</dt><dd>${distance.toFixed(1)} mi</dd></div>
      <div><dt>Bearing</dt><dd>${Math.round(bearing)} deg</dd></div>
      <div><dt>Vertical rate</dt><dd>${Number.isFinite(Number(plane.verticalRate)) ? `${Math.round(Number(plane.verticalRate))} fpm` : "Unknown"}</dd></div>
      <div><dt>Position</dt><dd>${plane.lat.toFixed(4)}, ${plane.lon.toFixed(4)}</dd></div>
    </dl>
  `;
  aircraftModal.hidden = false;
}

function closeAircraftDetails() {
  aircraftModal.hidden = true;
}

function stopGpsTracking() {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }
  gpsWatchId = null;
  gpsActive = false;
}

function fallbackToKdvt(message = "GPS unavailable. Using KDVT fallback.") {
  stopGpsTracking();
  airportSelect.value = `${kdvtFallbackCenter.lat},${kdvtFallbackCenter.lon}`;
  updateCoordinateVisibility();
  statusEl.textContent = message;
  updateCenter(kdvtFallbackCenter.lat, kdvtFallbackCenter.lon);
}

function startGpsTracking() {
  if (!navigator.geolocation) {
    fallbackToKdvt("GPS is not available in this browser. Using KDVT fallback.");
    return;
  }

  stopGpsTracking();
  gpsActive = true;
  statusEl.textContent = "Requesting GPS position...";

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const movedMiles = milesBetween(center.lat, center.lon, lat, lon);
      const needsAirspace = getVisibleAirspaceClasses().size && (!lastAirspaceKey || !airspaces.length);
      const shouldRefresh = movedMiles > 0.05 || !lastFetchAt || needsAirspace;

      latInput.value = lat.toFixed(4);
      lonInput.value = lon.toFixed(4);
      center = { lat, lon };
      weatherImageKey = "";
      statusEl.textContent = `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;

      if (shouldRefresh) {
        tracks.clear();
        lastAirspaceKey = "";
        fetchAirspace();
        fetchTraffic();
      }
    },
    (error) => {
      fallbackToKdvt(`GPS unavailable: ${error.message}. Using KDVT fallback.`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 8000,
      timeout: 15000
    }
  );
}

function trimTrackHistories() {
  for (const [key, history] of tracks.entries()) {
    tracks.set(key, history.slice(-breadcrumbLimit));
  }
}

settingsOpen.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);

panelToggle.addEventListener("click", () => {
  shell.classList.toggle("panel-collapsed");
  updatePanelToggle();
  window.setTimeout(resizeCanvas, 240);
});

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

aircraftClose.addEventListener("click", closeAircraftDetails);

aircraftModal.addEventListener("click", (event) => {
  if (event.target === aircraftModal) closeAircraftDetails();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  if (event.key === "Escape" && !aircraftModal.hidden) closeAircraftDetails();
});

breadcrumbLengthInput.addEventListener("input", () => {
  breadcrumbLimit = Math.max(2, Math.min(30, Number(breadcrumbLengthInput.value) || 12));
  breadcrumbReadout.textContent = String(breadcrumbLimit);
  trimTrackHistories();
});

sweepColorToggle.addEventListener("change", () => {
  sweepColor = sweepColorToggle.checked ? "orange" : "green";
});

groundTrafficToggle.addEventListener("change", () => {
  showGroundTraffic = groundTrafficToggle.checked;
  renderList();
});

radarDataToggle.addEventListener("change", () => {
  showRadarData = radarDataToggle.checked;
});

precipitationToggle.addEventListener("change", () => {
  showPrecipitation = precipitationToggle.checked;
  if (showPrecipitation) ensureWeatherImage();
});

aircraftListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-aircraft-key]");
  if (!button) return;
  openAircraftDetails(visibleAircraft().find((plane) => aircraftKey(plane) === button.dataset.aircraftKey));
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = aircraftHitAreas.find((area) => Math.hypot(area.x - x, area.y - y) <= 18);
  if (hit) openAircraftDetails(hit.plane);
});

function applySelectedAirport() {
  updateCoordinateVisibility();
  if (airportSelect.value === "gps") {
    startGpsTracking();
    return true;
  }

  if (!airportSelect.value) {
    stopGpsTracking();
    return false;
  }
  const [lat, lon] = airportSelect.value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  stopGpsTracking();
  updateCenter(lat, lon);
  return true;
}

airportSelect.addEventListener("change", () => {
  applySelectedAirport();
});

for (const input of [latInput, lonInput]) {
  input.addEventListener("input", () => {
    stopGpsTracking();
    airportSelect.value = "";
    updateCoordinateVisibility();
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyManualCoordinates();
});

function applyManualCoordinates() {
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    statusEl.textContent = "Latitude must be -90 to 90 and longitude must be -180 to 180.";
    return false;
  }

  stopGpsTracking();
  updateCenter(lat, lon);
  return true;
}

for (const input of [latInput, lonInput]) {
  input.addEventListener("change", applyManualCoordinates);
}

function updateCoordinateVisibility() {
  const managedCenter = Boolean(airportSelect.value);
  coordRow.hidden = managedCenter;
}

window.addEventListener("resize", resizeCanvas);

const initialCenterApplied = applySelectedAirport();
updateCoordinateVisibility();
updatePanelToggle();
resizeCanvas();
renderList();
if (airportSelect.value === "gps" && getVisibleAirspaceClasses().size) {
  fetchAirspace();
}
if (!initialCenterApplied) {
  fetchAirspace();
  fetchTraffic();
}
requestAnimationFrame(render);
