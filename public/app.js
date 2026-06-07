const canvas = document.querySelector("#radar");
const ctx = canvas.getContext("2d");
const form = document.querySelector("#controls");
const latInput = document.querySelector("#lat");
const lonInput = document.querySelector("#lon");
const demoModeInput = document.querySelector("#demoMode");
const rangeButtons = document.querySelector("#rangeButtons");
const statusEl = document.querySelector("#status");
const planeCountEl = document.querySelector("#planeCount");
const airportCountEl = document.querySelector("#airportCount");
const rangeReadoutEl = document.querySelector("#rangeReadout");
const lastUpdateEl = document.querySelector("#lastUpdate");
const aircraftListEl = document.querySelector("#aircraftList");

const sweepSeconds = 4.2;
const historyLimit = 12;
const allowedRanges = [5, 10, 15, 20, 50, 100];
const adsbBaseUrl = "https://opendata.adsb.fi/api/v3";
const airportsCsvUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const tracks = new Map();

let center = { lat: 33.4484, lon: -112.074 };
let radiusMiles = 20;
let aircraft = [];
let airports = [];
let running = false;
let lastSweepBucket = -1;
let lastFetchAt = 0;
let lastDataSource = "standby";
let pixelRatio = window.devicePixelRatio || 1;
let airportsCachePromise = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
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
  return Number.isFinite(number) ? `${Math.round(number).toLocaleString()} ft` : "ALT ?";
}

function formatSpeed(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} kt` : "SPD ?";
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
    tracks.set(key, history.slice(-historyLimit));
  }

  for (const [key, history] of tracks.entries()) {
    const latest = history.at(-1);
    if (!seenKeys.has(key) && latest && now - latest.at > 10 * 60 * 1000) {
      tracks.delete(key);
    }
  }
}

function createDemoAircraft() {
  const base = Date.now() / 1000;
  const demo = [
    ["AAL204", "N817AN", "B789", 0.27, 0.18, 34000, 477, 244],
    ["SWA1187", "N8675A", "B38M", -0.2, 0.26, 18250, 318, 128],
    ["N42EV", "N42EV", "C172", 0.08, -0.12, 4200, 104, 44],
    ["DAL943", "N376DN", "A321", -0.38, -0.18, 29100, 424, 300],
    ["UPS612", "N461UP", "B752", 0.42, -0.04, 11800, 261, 92]
  ];

  return demo.map(([callsign, nNumber, type, latOffset, lonOffset, altitude, speed, track], index) => {
    const drift = ((base / 26 + index) % 1) - 0.5;
    return {
      hex: `demo${index}`,
      callsign,
      nNumber,
      type,
      lat: center.lat + latOffset + Math.sin(base / 54 + index) * 0.035 + drift * 0.025,
      lon: center.lon + lonOffset + Math.cos(base / 49 + index) * 0.04,
      altitude,
      speed,
      track
    };
  });
}

function createDemoAirports() {
  return [
    { ident: "KPHX", iata: "PHX", name: "Phoenix Sky Harbor Intl", type: "large_airport", lat: 33.4353, lon: -112.006 },
    { ident: "KDVT", iata: "DVT", name: "Phoenix Deer Valley", type: "medium_airport", lat: 33.6883, lon: -112.083 },
    { ident: "KGEU", iata: "GEU", name: "Glendale Municipal", type: "small_airport", lat: 33.5269, lon: -112.295 },
    { ident: "KIWA", iata: "AZA", name: "Phoenix-Mesa Gateway", type: "large_airport", lat: 33.3078, lon: -111.655 }
  ].filter((airport) => milesBetween(center.lat, center.lon, airport.lat, airport.lon) <= radiusMiles);
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

  const [trafficResponse, airportRows] = await Promise.all([
    fetch(adsbUrl, {
      headers: {
        accept: "application/json"
      }
    }),
    loadAirportCache()
  ]);

  if (!trafficResponse.ok) {
    throw new Error(`adsb.fi returned ${trafficResponse.status}`);
  }

  const trafficData = await trafficResponse.json();
  const aircraftRows = (trafficData.ac || [])
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
    source: "adsb.fi web"
  };
}

async function fetchTraffic() {
  const params = new URLSearchParams({
    lat: center.lat,
    lon: center.lon,
    radiusMiles
  });

  try {
    if (demoModeInput.checked) throw new Error("Demo mode is on");
    const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
    const data = localHostnames.has(window.location.hostname)
      ? await fetchLocalTraffic(params).catch(() => fetchStaticTraffic())
      : await fetchStaticTraffic();

    aircraft = data.aircraft;
    airports = data.airports;
    lastDataSource = data.source;
    statusEl.textContent = `Live ADS-B feed active for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;
  } catch (error) {
    aircraft = createDemoAircraft();
    airports = createDemoAirports();
    lastDataSource = "demo";
    statusEl.textContent = `Using animated demo traffic. Live data was unavailable: ${error.message}.`;
  }

  updateTrackHistory(aircraft);
  lastFetchAt = Date.now();
  renderList();
}

function renderList() {
  planeCountEl.textContent = aircraft.length;
  airportCountEl.textContent = airports.length;
  rangeReadoutEl.textContent = `${radiusMiles} mi`;
  lastUpdateEl.textContent = lastFetchAt
    ? `${lastDataSource} | ${new Date(lastFetchAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "No sweep yet";

  const sorted = aircraft
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
          <div class="plane-head">
            <span>${escapeHtml(planeLabel(plane))}</span>
            <span>${escapeHtml(plane.type || "TYPE ?")}</span>
          </div>
          <div class="plane-meta">
            <span>${formatAltitude(plane.altitude)}</span>
            <span>${formatSpeed(plane.speed)}</span>
            <span>${plane.distance.toFixed(1)} mi</span>
          </div>
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
    ctx.fillText(airport.iata || airport.ident, point.x + 9, point.y - 8);
  }
  ctx.restore();
}

function drawTrack(scope, plane) {
  const key = plane.hex || plane.nNumber || plane.callsign;
  const history = tracks.get(key) || [];
  if (history.length < 2) return;

  ctx.save();
  ctx.strokeStyle = "rgba(98, 213, 255, 0.45)";
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

  for (const plane of aircraft) {
    const point = project(plane.lat, plane.lon, scope);
    if (point.distance > radiusMiles) continue;

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
    ctx.fillText(planeLabel(plane), point.x + 13, point.y - 11);
    ctx.fillStyle = "rgba(77, 255, 155, 0.86)";
    ctx.fillText(`${formatAltitude(plane.altitude)} ${formatSpeed(plane.speed)}`, point.x + 13, point.y + 4);
  }

  ctx.restore();
}

function drawSweep(scope, angle) {
  const gradient = ctx.createRadialGradient(scope.cx, scope.cy, 0, scope.cx, scope.cy, scope.radius);
  gradient.addColorStop(0, "rgba(77, 255, 155, 0.34)");
  gradient.addColorStop(0.75, "rgba(77, 255, 155, 0.12)");
  gradient.addColorStop(1, "rgba(77, 255, 155, 0)");

  ctx.save();
  ctx.translate(scope.cx, scope.cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, scope.radius, -0.24, 0.035);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "rgba(148, 255, 199, 0.96)";
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
  ctx.textAlign = "left";
  ctx.fillText(`CENTER ${center.lat.toFixed(4)} ${center.lon.toFixed(4)}`, 22, 28);
  ctx.fillText(`RANGE ${radiusMiles} STATUTE MI`, 22, 48);
  ctx.fillText(`SOURCE ${lastDataSource.toUpperCase()}`, 22, 68);
  ctx.textAlign = "right";
  ctx.fillText(`${aircraft.length} TRACKS`, scope.width - 22, 28);
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
  drawAirports(scope);
  drawAircraft(scope);
  drawSweep(scope, angle);
  drawHud(scope);

  requestAnimationFrame(render);
}

function setRange(nextRange) {
  radiusMiles = allowedRanges.includes(nextRange) ? nextRange : 20;
  for (const button of rangeButtons.querySelectorAll("button")) {
    button.classList.toggle("active", Number(button.dataset.range) === radiusMiles);
  }
  rangeReadoutEl.textContent = `${radiusMiles} mi`;
}

rangeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  setRange(Number(button.dataset.range));
  if (running) fetchTraffic();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    statusEl.textContent = "Latitude must be -90 to 90 and longitude must be -180 to 180.";
    return;
  }

  center = { lat, lon };
  running = true;
  tracks.clear();
  statusEl.textContent = "Sweep started. Refreshing aircraft on each pass.";
  fetchTraffic();
});

demoModeInput.addEventListener("change", () => {
  if (running) fetchTraffic();
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
renderList();
requestAnimationFrame(render);
