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
const flightLevelsToggle = document.querySelector("#flightLevelsToggle");
const radarDataToggle = document.querySelector("#radarDataToggle");
const precipitationToggle = document.querySelector("#precipitationToggle");
const radarSoundsToggle = document.querySelector("#radarSoundsToggle");
const radarSoundStyleSelect = document.querySelector("#radarSoundStyle");
const sweepColorToggle = document.querySelector("#sweepColorToggle");
const aircraftModal = document.querySelector("#aircraftModal");
const aircraftTitle = document.querySelector("#aircraftTitle");
const aircraftClose = document.querySelector("#aircraftClose");
const aircraftDetail = document.querySelector("#aircraftDetail");
const statusEl = document.querySelector("#status");
const lastUpdateEl = document.querySelector("#lastUpdate");
const aircraftListEl = document.querySelector("#aircraftList");

const sweepSeconds = 4.2;
const radarFadeMs = sweepSeconds * 3 * 1000;
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
const radarBlips = new Map();
const aircraftHighlights = new Map();
const aircraftTypeNames = new Map([
  ["A109", "AgustaWestland AW109"],
  ["A119", "AgustaWestland AW119"],
  ["A139", "AgustaWestland AW139"],
  ["A169", "AgustaWestland AW169"],
  ["A189", "AgustaWestland AW189"],
  ["A20N", "Airbus A320neo"],
  ["A21N", "Airbus A321neo"],
  ["A319", "Airbus A319"],
  ["A320", "Airbus A320"],
  ["A321", "Airbus A321"],
  ["A332", "Airbus A330-200"],
  ["A333", "Airbus A330-300"],
  ["A359", "Airbus A350-900"],
  ["A388", "Airbus A380"],
  ["AS50", "Airbus AS350"],
  ["AS55", "Airbus AS355"],
  ["B06", "Bell 206"],
  ["B407", "Bell 407"],
  ["B429", "Bell 429"],
  ["B505", "Bell 505"],
  ["B06T", "Bell 206 TwinRanger"],
  ["B06L", "Bell 206 LongRanger"],
  ["B412", "Bell 412"],
  ["B190", "Beech 1900"],
  ["B350", "Beechcraft King Air 350"],
  ["BE9L", "Beechcraft King Air 90 Series"],
  ["BE9T", "Beechcraft King Air F90"],
  ["BE10", "Beechcraft King Air 100"],
  ["BE20", "Beechcraft King Air 200"],
  ["BE30", "Beechcraft Super King Air"],
  ["BE33", "Beechcraft Bonanza"],
  ["BE35", "Beechcraft Bonanza"],
  ["BE36", "Beechcraft Bonanza"],
  ["BE40", "Beechcraft Premier"],
  ["BE55", "Beechcraft Baron"],
  ["BE58", "Beechcraft Baron"],
  ["C150", "Cessna 150"],
  ["C152", "Cessna 152"],
  ["C172", "Cessna 172"],
  ["C177", "Cessna Cardinal"],
  ["C180", "Cessna 180"],
  ["C182", "Cessna 182"],
  ["C185", "Cessna 185"],
  ["C205", "Cessna 205"],
  ["C206", "Cessna 206"],
  ["C207", "Cessna 207"],
  ["C208", "Cessna Caravan"],
  ["C210", "Cessna 210"],
  ["P210", "Cessna P210 Pressurized Centurion"],
  ["T210", "Cessna Turbo 210"],
  ["C25A", "Cessna Citation CJ2"],
  ["C25B", "Cessna Citation CJ3"],
  ["C25C", "Cessna Citation CJ4"],
  ["C27J", "Leonardo C-27J Spartan"],
  ["C310", "Cessna 310"],
  ["C340", "Cessna 340"],
  ["C402", "Cessna 402"],
  ["C414", "Cessna 414"],
  ["C421", "Cessna 421"],
  ["C510", "Cessna Citation Mustang"],
  ["C525", "Cessna CitationJet"],
  ["C526", "Cessna CitationJet"],
  ["C550", "Cessna Citation II"],
  ["C560", "Cessna Citation V"],
  ["C56X", "Cessna Citation Excel/XLS"],
  ["C650", "Cessna Citation III/VI/VII"],
  ["C68", "Cessna Citation 680 Series"],
  ["C68A", "Cessna Citation Latitude"],
  ["C680", "Cessna Citation Sovereign"],
  ["C700", "Cessna Citation Longitude"],
  ["COL4", "Cessna Corvalis TTx"],
  ["CL30", "Bombardier Challenger 300"],
  ["CL35", "Bombardier Challenger 350"],
  ["CL60", "Bombardier Challenger 600"],
  ["CRJ2", "Bombardier CRJ200"],
  ["CRJ7", "Bombardier CRJ700"],
  ["CRJ9", "Bombardier CRJ900"],
  ["DA40", "Diamond DA40"],
  ["DA42", "Diamond DA42"],
  ["DA62", "Diamond DA62"],
  ["E135", "Embraer ERJ-135"],
  ["E140", "Embraer ERJ-140"],
  ["E145", "Embraer ERJ-145"],
  ["E170", "Embraer 170"],
  ["E175", "Embraer 175"],
  ["E190", "Embraer 190"],
  ["E50P", "Embraer Phenom 100"],
  ["E55P", "Embraer Phenom 300"],
  ["F2TH", "Dassault Falcon 2000"],
  ["FA50", "Dassault Falcon 50"],
  ["G150", "Gulfstream G150"],
  ["G280", "Gulfstream G280"],
  ["GLEX", "Bombardier Global Express"],
  ["GLF4", "Gulfstream IV"],
  ["GLF5", "Gulfstream V"],
  ["GLF6", "Gulfstream G650"],
  ["H25B", "Hawker 800"],
  ["H500", "Hughes 500"],
  ["H60", "Sikorsky UH-60 Black Hawk"],
  ["LJ35", "Learjet 35"],
  ["LJ45", "Learjet 45"],
  ["LJ60", "Learjet 60"],
  ["M20P", "Mooney M20"],
  ["P28A", "Piper Cherokee"],
  ["P28B", "Piper Cherokee"],
  ["P28R", "Piper Arrow"],
  ["P28T", "Piper Turbo Arrow"],
  ["P32R", "Piper Saratoga"],
  ["P32T", "Piper Turbo Saratoga"],
  ["PA27", "Piper Aztec"],
  ["PA30", "Piper Twin Comanche"],
  ["PA31", "Piper Navajo"],
  ["PA34", "Piper Seneca"],
  ["PA44", "Piper Seminole"],
  ["PA46", "Piper Malibu/Mirage"],
  ["P46T", "Piper Meridian/M500/M600"],
  ["PC12", "Pilatus PC-12"],
  ["PC24", "Pilatus PC-24"],
  ["R22", "Robinson R22"],
  ["R44", "Robinson R44"],
  ["R66", "Robinson R66"],
  ["SF50", "Cirrus Vision Jet"],
  ["S22T", "Cirrus SR22T"],
  ["SR20", "Cirrus SR20"],
  ["SR22", "Cirrus SR22"],
  ["TBM7", "Daher TBM 700"],
  ["TBM8", "Daher TBM 850"],
  ["TBM9", "Daher TBM 900"],
  ["B737", "Boeing 737"],
  ["B738", "Boeing 737-800"],
  ["B739", "Boeing 737-900"],
  ["B38M", "Boeing 737 MAX 8"],
  ["B39M", "Boeing 737 MAX 9"],
  ["B752", "Boeing 757-200"],
  ["B763", "Boeing 767-300"],
  ["B772", "Boeing 777-200"],
  ["B77W", "Boeing 777-300ER"],
  ["B788", "Boeing 787-8"],
  ["B789", "Boeing 787-9"]
]);
const kdvtFallbackCenter = { lat: 33.6883, lon: -112.083 };

let center = { lat: 33.7292, lon: -111.9918 };
let radiusMiles = 10;
let breadcrumbLimit = 12;
let sweepColor = "orange";
let showGroundTraffic = false;
let showFlightLevelsTraffic = true;
let showRadarData = true;
let showPrecipitation = false;
let radarSoundsEnabled = false;
let radarSoundStyle = "radar";
let aircraft = [];
let airports = [];
let airspaces = [];
let running = true;
let lastSweepBucket = -1;
let previousSweepAngle = null;
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
let weatherImageZoom = null;
let audioCtx = null;
let audioMaster = null;
let lastContactSoundAt = 0;
let audioUnlocked = false;

function scheduleAircraftHighlight(key) {
  if (!key) return;
  const now = Date.now();
  aircraftHighlights.set(key, {
    startsAt: now + 1000,
    endsAt: now + 11000
  });
}

function aircraftHighlightState(key, now) {
  const highlight = aircraftHighlights.get(key);
  if (!highlight) return null;

  if (now > highlight.endsAt) {
    aircraftHighlights.delete(key);
    return null;
  }

  if (now < highlight.startsAt) {
    return { scale: 1, highlightMix: 0 };
  }

  const elapsed = now - highlight.startsAt;
  const duration = highlight.endsAt - highlight.startsAt;
  const highlightMix = Math.max(0, 1 - elapsed / duration);
  const pulseWindow = 3000;
  const pulseProgress = Math.min(1, elapsed / pulseWindow);
  const pulseWave = Math.max(0, Math.sin(pulseProgress * Math.PI));
  const scale = 1 + pulseWave * 2;

  return { scale, highlightMix, active: true };
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
    audioMaster = audioCtx.createGain();
    audioMaster.gain.value = 0.18;
    audioMaster.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

async function unlockRadarAudio() {
  const context = ensureAudioContext();
  if (!context || !audioMaster) return false;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }
  } catch {
    audioUnlocked = false;
    return false;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  oscillator.frequency.setValueAtTime(1, now);
  oscillator.connect(gain);
  gain.connect(audioMaster);
  oscillator.start(now);
  oscillator.stop(now + 0.01);

  audioUnlocked = context.state === "running";
  return audioUnlocked;
}

function queueRadarAudioUnlock() {
  const retryUnlock = async () => {
    if (!radarSoundsEnabled || audioUnlocked) return;
    if (await unlockRadarAudio()) playSweepTick();
  };

  window.addEventListener("pointerdown", retryUnlock, { once: true, passive: true });
  window.addEventListener("touchend", retryUnlock, { once: true, passive: true });
}

function resetWeatherImage() {
  weatherImage = null;
  weatherImageKey = "";
  weatherImageZoom = null;
}

function playTone({ frequency, type = "sine", duration = 0.05, gain = 0.05, slideTo = null, delay = 0 }) {
  if (!radarSoundsEnabled) return;

  const context = ensureAudioContext();
  if (!context || !audioMaster) return;
  if (context.state === "suspended") return;

  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const now = context.currentTime + delay;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(envelope);
  envelope.connect(audioMaster);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playSweepTick() {
  playTone({ frequency: 180, type: "triangle", duration: 0.035, gain: 0.035, slideTo: 90 });
}

function playContactBlip() {
  const now = performance.now();
  if (now - lastContactSoundAt < (radarSoundStyle === "submarine" ? 170 : 70)) return;

  lastContactSoundAt = now;
  if (radarSoundStyle === "submarine") {
    playTone({ frequency: 620, type: "sine", duration: 0.28, gain: 0.075, slideTo: 900 });
    playTone({ frequency: 900, type: "sine", duration: 0.18, gain: 0.035, slideTo: 520, delay: 0.16 });
    return;
  }

  playTone({ frequency: 920, type: "sine", duration: 0.055, gain: 0.06, slideTo: 1300 });
}

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

function normalizeRadians(value) {
  return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function planeSweepAngle(plane) {
  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);
  return normalizeRadians(((bearing - 90) * Math.PI) / 180);
}

function sweepCrossedAngle(previous, current, target) {
  if (previous === null) return false;
  return current >= previous ? target > previous && target <= current : target > previous || target <= current;
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

function aircraftSpeed(plane) {
  const speed = Number(plane.speed);
  return Number.isFinite(speed) ? Math.max(0, speed) : 0;
}

function breadcrumbLimitForAircraft(plane) {
  const speed = aircraftSpeed(plane);
  const speedFactor = speed <= 60 ? 0.45 : speed <= 160 ? 0.75 : speed <= 300 ? 1 : speed <= 450 ? 1.35 : 1.7;
  return Math.max(2, Math.min(45, Math.round(breadcrumbLimit * speedFactor)));
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

function aircraftTypeCode(plane) {
  return aircraftType(plane).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function titleCaseAircraftText(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([A-Z])([A-Z]{2,})\b/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
}

function friendlyAircraftType(plane) {
  if (plane.friendlyType) return plane.friendlyType;

  const type = aircraftType(plane).trim();
  const code = aircraftTypeCode(plane);
  if (aircraftTypeNames.has(code)) return aircraftTypeNames.get(code);
  if (type && /\s/.test(type)) return titleCaseAircraftText(type);
  return type || "";
}

function aircraftDisplayLabel(plane) {
  const type = aircraftType(plane);
  const ident = planeLabel(plane);
  return type ? `${type} ${ident}` : ident;
}

function isGroundTraffic(plane) {
  return plane.altitude === "ground";
}

function isFlightLevelTraffic(plane) {
  return Number(plane.altitude) > 18000;
}

function isVisibleTraffic(plane) {
  if (!showGroundTraffic && isGroundTraffic(plane)) return false;
  if (!showFlightLevelsTraffic && isFlightLevelTraffic(plane)) return false;
  return true;
}

function visibleAircraft() {
  return aircraft.filter(isVisibleTraffic);
}

function aircraftKey(plane) {
  return plane.hex || plane.nNumber || plane.callsign || `${plane.lat},${plane.lon}`;
}

function needsTypeLookup(plane) {
  const type = aircraftType(plane).trim().toUpperCase();
  const code = aircraftTypeCode(plane);
  return (
    plane.nNumber &&
    (!type || type === "TYPE ?" || type === "UNKNOWN" || (!plane.friendlyType && code && !aircraftTypeNames.has(code)))
  );
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
      const code = record.icao_type || record.type || "";
      const friendly = [record.manufacturer, record.model].filter(Boolean).join(" ").trim();
      return { code, friendly };
    })
    .catch(() => ({ code: "", friendly: "" }));

  aircraftTypeCache.set(registration, lookupPromise);
  const resolvedType = await lookupPromise;
  aircraftTypeCache.set(registration, resolvedType);
  return resolvedType;
}

async function resolveMissingAircraftTypes(nextAircraft) {
  const lookups = nextAircraft.filter(needsTypeLookup).map(async (plane) => {
    const resolved = await lookupAircraftType(plane.nNumber);
    const resolvedType = typeof resolved === "string" ? resolved : resolved.code;
    const friendlyType = typeof resolved === "string" ? "" : resolved.friendly;
    if ((resolvedType || friendlyType) && needsTypeLookup(plane)) {
      plane.resolvedType = resolvedType;
      plane.friendlyType = friendlyType || aircraftTypeNames.get(String(resolvedType).toUpperCase()) || "";
      if (!plane.type || ["TYPE ?", "UNKNOWN"].includes(plane.type.trim().toUpperCase())) {
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
    tracks.set(key, history.slice(-breadcrumbLimitForAircraft(plane)));
  }

  for (const [key, history] of tracks.entries()) {
    const latest = history.at(-1);
    if (!seenKeys.has(key) && latest && now - latest.at > 10 * 60 * 1000) {
      tracks.delete(key);
    }
  }
}

function appendTrackHistory(plane) {
  const key = plane.hex || plane.nNumber || plane.callsign;
  if (!key) return;

  const history = tracks.get(key) || [];
  const last = history.at(-1);
  if (!last || Math.abs(last.lat - plane.lat) > 0.0001 || Math.abs(last.lon - plane.lon) > 0.0001) {
    history.push({ lat: plane.lat, lon: plane.lon, at: Date.now() });
  }
  tracks.set(key, history.slice(-breadcrumbLimitForAircraft(plane)));
}

function pruneRadarBlips(nextAircraft) {
  const latestKeys = new Set(nextAircraft.map(aircraftKey));
  const latestByKey = new Map(nextAircraft.map((plane) => [aircraftKey(plane), plane]));
  const now = Date.now();

  for (const [key, plane] of radarBlips.entries()) {
    const latestPlane = latestByKey.get(key);
    const outOfRange =
      latestPlane && milesBetween(center.lat, center.lon, latestPlane.lat, latestPlane.lon) > radiusMiles;
    const stale = !latestKeys.has(key) && now - (plane.radarSeenAt || 0) > 10 * 60 * 1000;
    const faded = now - (plane.radarSeenAt || 0) > radarFadeMs;

    if (outOfRange || stale || faded) {
      radarBlips.delete(key);
      tracks.delete(key);
    }
  }
}

function radarBlipAlpha(plane, now = Date.now()) {
  const age = now - (plane.radarSeenAt || 0);
  return Math.max(0, Math.min(1, 1 - age / radarFadeMs));
}

function pruneExpiredRadarBlips(now = Date.now()) {
  for (const [key, plane] of radarBlips.entries()) {
    if (radarBlipAlpha(plane, now) <= 0) {
      radarBlips.delete(key);
      tracks.delete(key);
    }
  }
}

function visibleRadarAircraft() {
  const now = Date.now();
  return Array.from(radarBlips.values()).filter((plane) => radarBlipAlpha(plane, now) > 0 && isVisibleTraffic(plane));
}

function updateRadarBlipsForSweep(angle) {
  const currentSweepAngle = normalizeRadians(angle);

  for (const plane of aircraft) {
    if (!isVisibleTraffic(plane)) continue;
    if (milesBetween(center.lat, center.lon, plane.lat, plane.lon) > radiusMiles + 1) continue;

    const targetAngle = planeSweepAngle(plane);
    if (!sweepCrossedAngle(previousSweepAngle, currentSweepAngle, targetAngle)) continue;

    const snapshot = { ...plane, radarSeenAt: Date.now() };
    radarBlips.set(aircraftKey(plane), snapshot);
    appendTrackHistory(snapshot);
    playContactBlip();
  }

  previousSweepAngle = currentSweepAngle;
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
    weatherImageKey = key;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (weatherImageKey !== key) {
        weatherImageLoading = false;
        return;
      }
      weatherImage = image;
      weatherImageZoom = zoom;
      weatherImageLoading = false;
    };
    image.onerror = () => {
      if (weatherImageKey === key) resetWeatherImage();
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
  if (!weatherImage || weatherImageZoom === null) return;

  const earthMiles = 24901;
  const imageSpanMiles = (earthMiles * Math.cos((center.lat * Math.PI) / 180) * 2) / 2 ** weatherImageZoom;
  const size = Math.max(scope.radius * 2.05, (scope.radius * imageSpanMiles) / radiusMiles);
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
  if (clearTracks) {
    tracks.clear();
    radarBlips.clear();
    previousSweepAngle = null;
  }
  lastAirspaceKey = "";
  resetWeatherImage();
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

  pruneRadarBlips(aircraft);
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

function drawTrack(scope, plane, alpha = 1) {
  const key = plane.hex || plane.nNumber || plane.callsign;
  const history = (tracks.get(key) || [])
    .slice(-breadcrumbLimitForAircraft(plane))
    .filter((sample) => milesBetween(center.lat, center.lon, sample.lat, sample.lon) <= radiusMiles);
  if (history.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = alpha;
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

function drawAircraftContact({ plane, point, alpha, highlight }) {
  const highlightMix = highlight?.highlightMix || 0;
  const heading = Number.isFinite(Number(plane.track)) ? ((Number(plane.track) - 90) * Math.PI) / 180 : -Math.PI / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(point.x, point.y);
  ctx.rotate(heading);
  ctx.scale(highlight?.scale || 1, highlight?.scale || 1);
  ctx.fillStyle =
    plane.emergency && plane.emergency !== "none"
      ? "#ff6a75"
      : highlightMix > 0
        ? `rgba(255, 54, 72, ${0.42 + highlightMix * 0.58})`
        : "#e9fff3";
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, -5);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(233, 255, 243, 0.92)";
  if (showRadarData) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillText(aircraftDisplayLabel(plane), point.x + 13, point.y - 11);
    ctx.fillStyle = "rgba(77, 255, 155, 0.86)";
    ctx.fillText(`${formatAltitude(plane.altitude)} ${formatSpeed(plane.speed)}`, point.x + 13, point.y + 4);
    ctx.restore();
  }
}

function drawAircraft(scope) {
  ctx.save();
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  aircraftHitAreas = [];
  const now = Date.now();
  const normalContacts = [];
  const highlightedContacts = [];

  for (const plane of visibleRadarAircraft()) {
    const point = project(plane.lat, plane.lon, scope);
    if (point.distance > radiusMiles) continue;

    const alpha = radarBlipAlpha(plane, now);
    if (alpha <= 0) continue;

    if (alpha > 0.12) aircraftHitAreas.push({ key: aircraftKey(plane), x: point.x, y: point.y, plane });
    drawTrack(scope, plane, alpha);

    const key = aircraftKey(plane);
    const highlight = aircraftHighlightState(key, now);
    const contact = { plane, point, alpha, highlight };
    if (highlight?.active) highlightedContacts.push(contact);
    else normalContacts.push(contact);
  }

  for (const contact of normalContacts) drawAircraftContact(contact);
  for (const contact of highlightedContacts) drawAircraftContact(contact);

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
  ctx.textAlign = "left";
  ctx.fillText(`${visibleRadarAircraft().length} TRACKS`, 22, 28);
  ctx.fillText(`${airports.length} AIRPORTS`, 22, 48);
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
    playSweepTick();
    fetchTraffic();
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020503";
  ctx.fillRect(0, 0, width, height);

  pruneExpiredRadarBlips();
  updateRadarBlipsForSweep(angle);
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
  resetWeatherImage();
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
  const friendlyType = friendlyAircraftType(plane) || "Unknown aircraft type";
  aircraftTitle.textContent = plane.nNumber ? `Aircraft - ${plane.nNumber}` : "Aircraft";
  aircraftDetail.innerHTML = `
    <div class="detail-title">${escapeHtml(friendlyType)}</div>
    <dl>
      <div><dt>Callsign</dt><dd>${escapeHtml(plane.callsign || "Unknown")}</dd></div>
      <div><dt>Altitude</dt><dd>${formatAltitude(plane.altitude)}</dd></div>
      <div><dt>Speed</dt><dd>${formatSpeed(plane.speed)}</dd></div>
      <div><dt>Track</dt><dd>${Number.isFinite(Number(plane.track)) ? `${Math.round(Number(plane.track))} deg` : "Unknown"}</dd></div>
      <div><dt>Distance</dt><dd>${distance.toFixed(1)} mi</dd></div>
      <div><dt>Bearing</dt><dd>${Math.round(bearing)} deg</dd></div>
      <div><dt>Vertical rate</dt><dd>${Number.isFinite(Number(plane.verticalRate)) ? `${Math.round(Number(plane.verticalRate))} fpm` : "Unknown"}</dd></div>
    </dl>
  `;
  aircraftModal.hidden = false;
}

function closeAircraftDetails() {
  aircraftModal.hidden = true;
  aircraftTitle.textContent = "Aircraft";
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
      resetWeatherImage();
      statusEl.textContent = `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;

      if (shouldRefresh) {
        tracks.clear();
        radarBlips.clear();
        previousSweepAngle = null;
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
    const plane = aircraft.find((candidate) => aircraftKey(candidate) === key) || radarBlips.get(key);
    const limit = plane ? breadcrumbLimitForAircraft(plane) : breadcrumbLimit;
    tracks.set(key, history.slice(-limit));
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

flightLevelsToggle.addEventListener("change", () => {
  showFlightLevelsTraffic = flightLevelsToggle.checked;
  renderList();
});

radarDataToggle.addEventListener("change", () => {
  showRadarData = radarDataToggle.checked;
});

precipitationToggle.addEventListener("change", () => {
  showPrecipitation = precipitationToggle.checked;
  if (showPrecipitation) ensureWeatherImage();
});

radarSoundsToggle.addEventListener("change", async () => {
  radarSoundsEnabled = radarSoundsToggle.checked;
  audioUnlocked = false;
  if (radarSoundsEnabled && (await unlockRadarAudio())) {
    playSweepTick();
  } else if (radarSoundsEnabled) {
    queueRadarAudioUnlock();
  }
});

radarSoundStyleSelect.addEventListener("change", () => {
  radarSoundStyle = radarSoundStyleSelect.value === "submarine" ? "submarine" : "radar";
  if (radarSoundsEnabled) playContactBlip();
});

aircraftListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-aircraft-key]");
  if (!button) return;
  scheduleAircraftHighlight(button.dataset.aircraftKey);
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
