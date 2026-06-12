const canvas = document.querySelector("#radar");
const ctx = canvas.getContext("2d");
const radarWrap = document.querySelector(".radar-wrap");
const shell = document.querySelector(".shell");
const form = document.querySelector("#controls");
const panelToggle = document.querySelector("#panelToggle");
const radarModeToggle = document.querySelector("#radarModeToggle");
const wxToggle = document.querySelector("#wxToggle");
const wxRangeButton = document.querySelector("#wxRangeButton");
const wxNearestTarget = document.querySelector("#wxNearestTarget");
const airportSelect = document.querySelector("#airportSelect");
const coordRow = document.querySelector("#coordRow");
const latInput = document.querySelector("#lat");
const lonInput = document.querySelector("#lon");
const rangeButtons = document.querySelector("#rangeButtons");
const airspaceToggles = document.querySelector("#airspaceToggles");
const settingsOpen = document.querySelector("#settingsOpen");
const settingsClose = document.querySelector("#settingsClose");
const settingsModal = document.querySelector("#settingsModal");
const legendOpen = document.querySelector("#legendOpen");
const legendClose = document.querySelector("#legendClose");
const legendModal = document.querySelector("#legendModal");
const groundTrafficToggle = document.querySelector("#groundTrafficToggle");
const flightLevelsToggle = document.querySelector("#flightLevelsToggle");
const radarDataToggle = document.querySelector("#radarDataToggle");
const radarSoundStyleSelect = document.querySelector("#radarSoundStyle");
const orientationModeSelect = document.querySelector("#orientationMode");
const sweepColorToggle = document.querySelector("#sweepColorToggle");
const aircraftModal = document.querySelector("#aircraftModal");
const aircraftTitle = document.querySelector("#aircraftTitle");
const aircraftClose = document.querySelector("#aircraftClose");
const aircraftDetail = document.querySelector("#aircraftDetail");
const statusEl = document.querySelector("#status");
const lastUpdateEl = document.querySelector("#lastUpdate");
const aircraftListEl = document.querySelector("#aircraftList");
const proximityAlertEl = document.querySelector("#proximityAlert");

const sweepSeconds = 4.2;
const wxSweepSeconds = 2.25;
const wxSectorDegrees = 50;
const radarFadeMs = sweepSeconds * 3 * 1000;
const allowedRanges = [2, 5, 10, 15, 20, 50, 100];
const wxRanges = [2, 5, 10, 20, 50, 100];
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
const airportsCsvUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const runwaysCsvUrl = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const weatherMapsUrl = "https://api.rainviewer.com/public/weather-maps.json";
const airspaceQueryUrl =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query";
const aircraftLookupBaseUrl = "https://api.adsbdb.com/v0/aircraft";
const queryParams = new URLSearchParams(window.location.search);
const proxyUrlFromQuery = queryParams.get("proxy");
if (proxyUrlFromQuery) {
  window.localStorage.setItem("ADSB_RADAR_PROXY_URL", proxyUrlFromQuery);
}
const stratusUrlFromQuery = queryParams.get("stratus");
if (stratusUrlFromQuery) {
  window.localStorage.setItem("ADSB_RADAR_STRATUS_URL", stratusUrlFromQuery);
}
const adsbProxyBaseUrl = (
  proxyUrlFromQuery ||
  window.localStorage.getItem("ADSB_RADAR_PROXY_URL") ||
  window.ADSB_RADAR_PROXY_URL ||
  ""
).replace(/\/$/, "");
const stratusBridgeBaseUrl = (
  stratusUrlFromQuery ||
  window.localStorage.getItem("ADSB_RADAR_STRATUS_URL") ||
  window.ADSB_RADAR_STRATUS_URL ||
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
  ["AP22", "Aeroprakt A-22"],
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
  ["B36T", "Beechcraft Bonanza Turbo"],
  ["BE40", "Hawker 400"],
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
  ["T206", "Cessna Turbo Stationair"],
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
  ["C750", "Cessna Citation X"],
  ["C82R", "Cessna R182 Skylane RG"],
  ["CH7B", "Heli-Sport CH-7 Kompress"],
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
  ["EC45", "Eurocopter 145"],
  ["E135", "Embraer ERJ-135"],
  ["E140", "Embraer ERJ-140"],
  ["E145", "Embraer ERJ-145"],
  ["E170", "Embraer 170"],
  ["E175", "Embraer 175"],
  ["E75", "Embraer 175"],
  ["E75L", "Embraer 175"],
  ["E75S", "Embraer 175"],
  ["E190", "Embraer 190"],
  ["E295", "Embraer E195-E2"],
  ["E50P", "Embraer Phenom 100"],
  ["E55P", "Embraer Phenom 300"],
  ["E550", "Embraer Legacy 500 / Praetor 600"],
  ["F2TH", "Dassault Falcon 2000"],
  ["FA50", "Dassault Falcon 50"],
  ["FA7X", "Dassault Falcon 7X"],
  ["G150", "Gulfstream G150"],
  ["G280", "Gulfstream G280"],
  ["G12T", "Grob G 120TP"],
  ["GLEX", "Bombardier Global Express"],
  ["GLF4", "Gulfstream IV"],
  ["GLF5", "Gulfstream V"],
  ["GLF6", "Gulfstream G650"],
  ["H25B", "Hawker 800"],
  ["H500", "Hughes 500"],
  ["H60", "Sikorsky UH-60 Black Hawk"],
  ["LEG2", "Lancair Legacy 2000"],
  ["LJ35", "Learjet 35"],
  ["LJ45", "Learjet 45"],
  ["LJ60", "Learjet 60"],
  ["M20P", "Mooney M20"],
  ["MRF1", "Dassault Mirage F1"],
  ["PA18", "Piper Super Cub"],
  ["PA24", "Piper Comanche"],
  ["P28A", "Piper Cherokee"],
  ["PA28A", "Piper Cherokee"],
  ["P28B", "Piper Cherokee 235 / Dakota"],
  ["PA28B", "Piper Cherokee 235 / Dakota"],
  ["P28R", "Piper Arrow"],
  ["PA28R", "Piper Arrow"],
  ["P28T", "Piper Turbo Arrow"],
  ["PA28T", "Piper Turbo Arrow"],
  ["P32R", "Piper Saratoga"],
  ["PA32", "Piper Cherokee Six"],
  ["PA32R", "Piper Saratoga"],
  ["P32T", "Piper Turbo Saratoga"],
  ["PA32T", "Piper Turbo Saratoga"],
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
  ["BCS3", "Airbus A220-300"],
  ["BL17", "Bellanca 17 Viking"],
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
const breadcrumbBaseLimit = 12;
let sweepColor = "orange";
let showGroundTraffic = false;
let showFlightLevelsTraffic = true;
let showRadarData = true;
let showPrecipitation = false;
let radarSoundsEnabled = true;
let radarSoundStyle = "softTick";
let orientationMode = "north";
let weatherMode = false;
let previousRangeBeforeWx = 10;
let aircraft = [];
let airports = [];
let airspaces = [];
let running = true;
let lastSweepBucket = -1;
let lastWxSweepBucket = -1;
let previousSweepAngle = null;
let lastFetchAt = 0;
let lastDataSource = "standby";
let trafficFetchInFlight = false;
let trafficBackoffMs = 0;
let nextTrafficFetchAt = 0;
let pixelRatio = window.devicePixelRatio || 1;
let airportsCachePromise = null;
let runwaysCachePromise = null;
let lastAirspaceKey = "";
let aircraftHitAreas = [];
let currentAircraftContacts = [];
let aircraftTextObstacles = [];
let gpsWatchId = null;
let gpsActive = false;
let gpsTrackDegrees = null;
let gpsSpeedKts = 0;
let gpsAltitudeFt = null;
let compassHeadingDegrees = null;
let compassPermissionRequested = false;
let gpsTrail = [];
let lastGpsTrailAt = 0;
let weatherMeta = null;
let weatherMetaFetchedAt = 0;
let weatherTiles = [];
let weatherImageKey = "";
let weatherImageLoading = false;
let audioCtx = null;
let audioMaster = null;
let audioLimiter = null;
let lastContactSoundAt = 0;
let lastTrafficAlertSoundAt = 0;
let audioUnlocked = false;
let proximityAlertKey = "";
let proximityAlertSolid = false;
let proximityHighlightLastAt = 0;
let trafficAlertActive = false;

function scheduleAircraftHighlight(key, { delayMs = 1000, durationMs = 10000 } = {}) {
  if (!key) return;
  const now = Date.now();
  aircraftHighlights.set(key, {
    startsAt: now + delayMs,
    endsAt: now + delayMs + durationMs
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
    audioLimiter = audioCtx.createDynamicsCompressor();
    audioMaster.gain.value = 0.42;
    audioLimiter.threshold.value = -18;
    audioLimiter.knee.value = 14;
    audioLimiter.ratio.value = 8;
    audioLimiter.attack.value = 0.003;
    audioLimiter.release.value = 0.12;
    audioMaster.connect(audioLimiter);
    audioLimiter.connect(audioCtx.destination);
  }

  if (audioCtx.state !== "running") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

async function unlockRadarAudio() {
  const context = ensureAudioContext();
  if (!context || !audioMaster) return false;

  try {
    if (context.state !== "running") {
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

  window.setTimeout(retryUnlock, 0);
  window.addEventListener("click", retryUnlock, { once: true, passive: true });
  window.addEventListener("keydown", retryUnlock, { once: true, passive: true });
  window.addEventListener("pointerdown", retryUnlock, { once: true, passive: true });
  window.addEventListener("touchend", retryUnlock, { once: true, passive: true });
}

async function resumeRadarAudio({ playTest = false } = {}) {
  if (!radarSoundsEnabled) return false;
  const context = ensureAudioContext();
  if (!context) return false;

  try {
    if (context.state !== "running") {
      await context.resume();
    }
  } catch {
    audioUnlocked = false;
    return false;
  }

  audioUnlocked = context.state === "running";
  if (audioUnlocked && playTest) playSweepTick();
  return audioUnlocked;
}

function installRadarAudioRecovery() {
  const resume = () => {
    resumeRadarAudio();
  };
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("click", resume, { passive: true });
  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("touchend", resume, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resume();
  });
}

function handleDeviceOrientation(event) {
  const webkitHeading = Number(event.webkitCompassHeading);
  if (Number.isFinite(webkitHeading)) {
    compassHeadingDegrees = (webkitHeading + 360) % 360;
    return;
  }

  const alpha = Number(event.alpha);
  if (Number.isFinite(alpha)) {
    compassHeadingDegrees = (360 - alpha + 360) % 360;
  }
}

async function enableCompassHeading() {
  if (compassPermissionRequested) return;

  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") return;
    }
    compassPermissionRequested = true;
    window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
    window.addEventListener("deviceorientation", handleDeviceOrientation, true);
  } catch (error) {
    console.warn("Unable to enable compass heading", error);
  }
}

function queueCompassHeadingEnable() {
  if (!gpsActive || compassPermissionRequested) return;

  const requestCompass = () => {
    if (gpsActive && orientationMode === "track") enableCompassHeading();
  };

  if (typeof DeviceOrientationEvent === "undefined" || typeof DeviceOrientationEvent.requestPermission !== "function") {
    window.setTimeout(requestCompass, 0);
  }
  window.addEventListener("click", requestCompass, { once: true, passive: true });
  window.addEventListener("pointerdown", requestCompass, { once: true, passive: true });
  window.addEventListener("touchend", requestCompass, { once: true, passive: true });
}

function resetWeatherImage() {
  weatherTiles = [];
  weatherImageKey = "";
  weatherImageLoading = false;
}

function randomJitter(minMs = 500, maxMs = 2000) {
  return minMs + Math.random() * (maxMs - minMs);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scheduleNextTrafficFetch({ failed = false } = {}) {
  if (failed) {
    trafficBackoffMs = trafficBackoffMs ? Math.min(60000, trafficBackoffMs * 2) : 5000;
    nextTrafficFetchAt = Date.now() + trafficBackoffMs + randomJitter(750, 3000);
    return;
  }

  trafficBackoffMs = 0;
  nextTrafficFetchAt = Date.now() + 6500 + randomJitter(500, 2500);
}

function playTone({ frequency, type = "sine", duration = 0.05, gain = 0.05, slideTo = null, delay = 0 }) {
  if (!radarSoundsEnabled) return;

  const context = ensureAudioContext();
  if (!context || !audioMaster) return;
  if (context.state !== "running") {
    resumeRadarAudio();
    return;
  }

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
  playTone({ frequency: 360, type: "triangle", duration: 0.04, gain: 0.07, slideTo: 460 });
}

function playTrafficAlertPing(alert) {
  if (!alert || !radarSoundsEnabled) return;
  const now = performance.now();
  const distanceFactor = clamp(alert.distance / 3, 0, 1);
  const interval = alert.diverging
    ? clamp(760 + alert.distance * 820, 760, 1900)
    : clamp(170 + distanceFactor * 1050, 170, 1220);

  if (now - lastTrafficAlertSoundAt < interval) return;

  lastTrafficAlertSoundAt = now;
  const closeness = 1 - distanceFactor;
  const base = alert.diverging ? 430 : 500 + closeness * 190;
  const gain = alert.diverging ? 0.08 : 0.1 + closeness * 0.05;
  playTone({ frequency: base, type: "sine", duration: 0.24, gain, slideTo: base + 180 + closeness * 140 });
  playTone({ frequency: base + 430, type: "sine", duration: 0.16, gain: gain * 0.42, slideTo: base + 210, delay: 0.13 });
}

function playContactBlip() {
  const now = performance.now();
  const soundSpacing = radarSoundStyle === "submarine" || radarSoundStyle === "sonar" ? 170 : 70;
  if (now - lastContactSoundAt < soundSpacing) return;

  lastContactSoundAt = now;
  if (radarSoundStyle === "submarine") {
    playTone({ frequency: 620, type: "sine", duration: 0.28, gain: 0.13, slideTo: 900 });
    playTone({ frequency: 900, type: "sine", duration: 0.18, gain: 0.065, slideTo: 520, delay: 0.16 });
    return;
  }

  if (radarSoundStyle === "chirp") {
    playTone({ frequency: 740, type: "sawtooth", duration: 0.075, gain: 0.075, slideTo: 1680 });
    return;
  }

  if (radarSoundStyle === "sonar") {
    playTone({ frequency: 360, type: "triangle", duration: 0.22, gain: 0.11, slideTo: 780 });
    playTone({ frequency: 720, type: "sine", duration: 0.18, gain: 0.055, slideTo: 420, delay: 0.18 });
    return;
  }

  if (radarSoundStyle === "tick") {
    playTone({ frequency: 620, type: "square", duration: 0.035, gain: 0.095, slideTo: 760 });
    return;
  }

  if (radarSoundStyle === "softTick") {
    playTone({ frequency: 240, type: "square", duration: 0.028, gain: 0.075, slideTo: 120 });
    return;
  }

  if (radarSoundStyle === "sharpTick") {
    playTone({ frequency: 980, type: "square", duration: 0.022, gain: 0.082, slideTo: 520 });
    return;
  }

  if (radarSoundStyle === "geigerClick") {
    playTone({ frequency: 1450, type: "square", duration: 0.014, gain: 0.075, slideTo: 310 });
    return;
  }

  if (radarSoundStyle === "lowTick") {
    playTone({ frequency: 165, type: "triangle", duration: 0.045, gain: 0.12, slideTo: 95 });
    return;
  }

  if (radarSoundStyle === "glassPing") {
    playTone({ frequency: 1180, type: "sine", duration: 0.11, gain: 0.09, slideTo: 920 });
    return;
  }

  playTone({ frequency: 920, type: "sine", duration: 0.055, gain: 0.11, slideTo: 1300 });
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
  updateProximityAlert();
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
      const ident = row[index.ident];

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !usefulTypes.has(type) || ident?.startsWith("US") || ident?.startsWith("AZ")) {
        return null;
      }

      return {
        ident,
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

function parseRunwaysCsv(csv) {
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));

  return lines
    .map((line) => {
      const row = parseCsvLine(line);
      const airportIdent = row[index.airport_ident];
      const leLat = parseNumber(row[index.le_latitude_deg]);
      const leLon = parseNumber(row[index.le_longitude_deg]);
      const heLat = parseNumber(row[index.he_latitude_deg]);
      const heLon = parseNumber(row[index.he_longitude_deg]);

      if (!airportIdent || !Number.isFinite(leLat) || !Number.isFinite(leLon) || !Number.isFinite(heLat) || !Number.isFinite(heLon)) {
        return null;
      }

      return {
        airportIdent,
        leIdent: row[index.le_ident],
        heIdent: row[index.he_ident],
        leLat,
        leLon,
        heLat,
        heLon,
        lengthFt: parseNumber(row[index.length_ft]),
        widthFt: parseNumber(row[index.width_ft]),
        leHeading: parseNumber(row[index.le_heading_degT]),
        heHeading: parseNumber(row[index.he_heading_degT])
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
    nNumber: (raw.nNumber || raw.r || raw.reg || raw.registration || "").trim(),
    callsign: (raw.callsign || raw.flight || raw.call || "").trim(),
    type: (raw.t || raw.type || "").trim(),
    lat,
    lon,
    altitude: raw.altitude ?? raw.alt_baro ?? raw.alt_geom ?? null,
    speed: raw.speed ?? raw.gs ?? raw.tas ?? raw.ias ?? null,
    track: raw.track ?? raw.true_heading ?? raw.nav_heading ?? null,
    verticalRate: raw.verticalRate ?? raw.baro_rate ?? raw.geom_rate ?? null,
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

function normalizedDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function relativeBearingDegrees(bearing) {
  const heading = activeTrackHeadingDegrees() ?? 0;
  return normalizedDegrees(bearing - heading);
}

function clockDirection(relativeBearing) {
  const hour = Math.round(relativeBearing / 30) || 12;
  return hour > 12 ? hour - 12 : hour;
}

function altitudeRelation(planeAltitude) {
  const ownAltitude = Number(gpsAltitudeFt);
  const targetAltitude = Number(planeAltitude);
  if (!Number.isFinite(ownAltitude) || !Number.isFinite(targetAltitude)) return "";

  const difference = targetAltitude - ownAltitude;
  if (Math.abs(difference) <= 300) return " Same Altitude";
  return difference > 0 ? " High" : " Low";
}

function relativeAltitudeDetail(planeAltitude) {
  const ownAltitude = Number(gpsAltitudeFt);
  const targetAltitude = Number(planeAltitude);
  if (!Number.isFinite(ownAltitude) || !Number.isFinite(targetAltitude)) return formatAltitude(planeAltitude);

  const difference = targetAltitude - ownAltitude;
  const rounded = Math.round(Math.abs(difference) / 100) * 100;
  if (rounded <= 300) return "same altitude";
  return `${rounded.toLocaleString()} ${difference > 0 ? "above" : "below"}`;
}

function formatRangeToTarget(distance) {
  return `${distance.toFixed(distance < 10 ? 1 : 0)} NM`;
}

function isAlertDisplayDevice() {
  return window.matchMedia("(max-width: 1180px), (pointer: coarse)").matches;
}

function isDivergingFromGps(plane, currentDistance) {
  const history = tracks.get(aircraftKey(plane)) || [];
  const previous = history[history.length - 2] || history[history.length - 1];
  if (!previous) return false;

  const previousDistance = milesBetween(center.lat, center.lon, previous.lat, previous.lon);
  return currentDistance > previousDistance + 0.05;
}

function proximityCandidate(plane) {
  if (isGroundTraffic(plane)) return null;

  const distance = milesBetween(center.lat, center.lon, plane.lat, plane.lon);
  const diverging = isDivergingFromGps(plane, distance);
  if (diverging && distance > 1) return null;
  if (!diverging && distance > 3) return null;

  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);
  return {
    plane,
    distance,
    diverging,
    relativeBearing: relativeBearingDegrees(bearing)
  };
}

function clearProximityAlert() {
  proximityAlertEl.hidden = true;
  proximityAlertEl.textContent = "";
  proximityAlertEl.classList.remove("diverging", "solid");
  proximityAlertKey = "";
  proximityAlertSolid = false;
  trafficAlertActive = false;
  updateBottomRangeButton();
}

function nearestVisibleAircraft() {
  return visibleAircraft()
    .map((plane) => ({
      plane,
      distance: milesBetween(center.lat, center.lon, plane.lat, plane.lon),
      bearing: bearingDegrees(center.lat, center.lon, plane.lat, plane.lon)
    }))
    .filter((target) => target.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)[0];
}

function updateWxNearestTarget() {
  if (!wxNearestTarget) return;

  if (!weatherMode) {
    wxNearestTarget.hidden = true;
    wxNearestTarget.textContent = "";
    return;
  }

  const nearest = nearestVisibleAircraft();
  if (!nearest) {
    wxNearestTarget.textContent = "Range to nearest target --";
    wxNearestTarget.hidden = false;
    return;
  }

  const relativeBearing = relativeBearingDegrees(nearest.bearing);
  wxNearestTarget.textContent = `Range to nearest target ${formatRangeToTarget(nearest.distance)} ${clockDirection(relativeBearing)} O'Clock, ${relativeAltitudeDetail(nearest.plane.altitude)}`;
  wxNearestTarget.hidden = false;
}

function highlightProximityTarget(alert) {
  const key = aircraftKey(alert.plane);
  const now = Date.now();
  if (key !== proximityAlertKey) {
    proximityAlertKey = key;
    proximityAlertSolid = false;
    proximityHighlightLastAt = 0;
  }

  if (!proximityHighlightLastAt || now - proximityHighlightLastAt > 8500) {
    scheduleAircraftHighlight(key, { delayMs: 0, durationMs: 10000 });
    proximityHighlightLastAt = now;
  }
}

function updateProximityAlert() {
  if (!proximityAlertEl) return;
  const panelHidden = shell.classList.contains("panel-collapsed");
  if (!gpsActive || !panelHidden || !isAlertDisplayDevice()) {
    clearProximityAlert();
    return;
  }

  const alert = visibleAircraft()
    .map(proximityCandidate)
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!alert) {
    clearProximityAlert();
    return;
  }

  const alertKey = aircraftKey(alert.plane);
  if (alertKey !== proximityAlertKey) {
    if (weatherMode) setWeatherMode(false);
    if (radiusMiles !== 5) {
      setRange(5);
      fetchAirspace();
      fetchTraffic({ force: true });
    }
  }
  trafficAlertActive = true;
  updateBottomRangeButton();
  highlightProximityTarget(alert);
  playTrafficAlertPing(alert);
  proximityAlertEl.textContent = `Traffic ${clockDirection(alert.relativeBearing)} O'Clock ${formatRangeToTarget(alert.distance)}${altitudeRelation(alert.plane.altitude)} ${formatAltitude(alert.plane.altitude)}`;
  proximityAlertEl.classList.toggle("diverging", alert.diverging);
  proximityAlertEl.classList.toggle("solid", proximityAlertSolid);
  proximityAlertEl.hidden = false;
}

function destinationPoint(lat, lon, bearing, distanceMiles) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const angularDistance = distanceMiles / earthMiles;
  const bearingRad = toRad(bearing);
  const latRad = toRad(lat);
  const lonRad = toRad(lon);
  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );
  const destLon =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat)
    );

  return {
    lat: toDeg(destLat),
    lon: ((toDeg(destLon) + 540) % 360) - 180
  };
}

function activeTrackHeadingDegrees() {
  if (!gpsActive || orientationMode !== "track") return null;
  if (Number.isFinite(gpsTrackDegrees) && gpsSpeedKts >= 0.8) return gpsTrackDegrees;
  if (Number.isFinite(compassHeadingDegrees)) return compassHeadingDegrees;
  return null;
}

function radarRotationDegrees() {
  return activeTrackHeadingDegrees() ?? 0;
}

function screenAngleForBearing(bearing) {
  return ((bearing - radarRotationDegrees() - 90) * Math.PI) / 180;
}

function project(lat, lon, scope) {
  const distance = milesBetween(center.lat, center.lon, lat, lon);
  const bearing = bearingDegrees(center.lat, center.lon, lat, lon);
  const angle = screenAngleForBearing(bearing);
  const radius = (distance / radiusMiles) * scope.radius;

  return {
    x: scope.cx + Math.cos(angle) * radius,
    y: scope.cy + Math.sin(angle) * radius,
    distance,
    bearing
  };
}

function radarScope(width, height) {
  return {
    width,
    height,
    cx: width / 2,
    cy: height / 2,
    radius: Math.max(80, Math.min(width, height) * 0.43)
  };
}

function weatherScope(width, height) {
  const framePad = Math.max(22, Math.min(width, height) * 0.035);
  const cy = height - framePad - 18;
  const radius = Math.max(120, Math.min(width * 0.64, height * 0.9));
  return {
    width,
    height,
    cx: width / 2,
    cy,
    radius
  };
}

function normalizeRadians(value) {
  return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function planeSweepAngle(plane) {
  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);
  return normalizeRadians(screenAngleForBearing(bearing));
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
  return Math.max(2, Math.min(45, Math.round(breadcrumbBaseLimit * speedFactor)));
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

function isAsiArcher(plane) {
  return /^ASI\d+/i.test(String(plane.callsign || "").trim());
}

function isScaCessna172(plane) {
  return /^SCA\d+/i.test(String(plane.callsign || "").trim());
}

function isVarCirrusSr20(plane) {
  return /^VAR\d*/i.test(String(plane.callsign || "").trim());
}

function aircraftType(plane) {
  if (isAsiArcher(plane)) return "PA28";
  if (isScaCessna172(plane)) return "C172";
  if (isVarCirrusSr20(plane)) return "SR20";
  const type = String(plane.type || plane.resolvedType || "").trim();
  return type.toLowerCase() === "adsb_icao" ? "Pvt" : type;
}

function faaRegistryUrl(nNumber) {
  const registration = String(nNumber || "").trim().toUpperCase().replace(/^N/, "");
  return `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(registration)}`;
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
  if (isAsiArcher(plane)) return "Piper Archer";
  if (isScaCessna172(plane)) return "Cessna 172";
  if (isVarCirrusSr20(plane)) return "Cirrus SR20";

  const type = aircraftType(plane).trim();
  const code = aircraftTypeCode(plane);
  if (aircraftTypeNames.has(code)) return aircraftTypeNames.get(code);
  const codeToken = type.toUpperCase().split(/\s+/).find((token) => aircraftTypeNames.has(token));
  if (codeToken) return aircraftTypeNames.get(codeToken);
  if (type && /\s/.test(type)) return titleCaseAircraftText(type);
  return type || "";
}

function aircraftDisplayLabel(plane) {
  const type = aircraftType(plane);
  const ident = planeLabel(plane);
  return type ? `${type} ${ident}` : ident;
}

function aircraftCompactLabel(plane) {
  return aircraftType(plane) || planeLabel(plane);
}

function aircraftLabelBox(contact, compact = false) {
  const x = contact.point.x + 13;
  const y = compact ? contact.point.y - 21 : contact.point.y - 23;
  const label = compact ? aircraftCompactLabel(contact.plane) : aircraftDisplayLabel(contact.plane);
  const data = `${formatAltitude(contact.plane.altitude)} ${formatSpeed(contact.plane.speed)}`;
  const width = compact ? ctx.measureText(label).width : Math.max(ctx.measureText(label).width, ctx.measureText(data).width);
  return {
    x,
    y,
    width,
    height: compact ? 16 : 31
  };
}

function textBox(x, baselineY, text, height = 15) {
  return {
    x,
    y: baselineY - height,
    width: ctx.measureText(text).width,
    height
  };
}

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function intersectsAircraftText(box) {
  return aircraftTextObstacles.some((obstacle) => boxesIntersect(box, obstacle));
}

function markCompactAircraftLabels(contacts) {
  if (!showRadarData) return;
  const boxes = contacts.map((contact) => aircraftLabelBox(contact));

  for (let index = 0; index < contacts.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < contacts.length; otherIndex += 1) {
      if (!boxesIntersect(boxes[index], boxes[otherIndex])) continue;
      contacts[index].compactLabel = true;
      contacts[otherIndex].compactLabel = true;
    }
  }
}

function updateAircraftTextObstacles(contacts) {
  aircraftTextObstacles = showRadarData ? contacts.map((contact) => aircraftLabelBox(contact, Boolean(contact.compactLabel))) : [];
}

function isGroundTraffic(plane) {
  return plane.altitude === "ground";
}

function isFlightLevelTraffic(plane) {
  return Number(plane.altitude) > 18000;
}

function altitudeColorStyle(plane) {
  const altitude = Number(plane.altitude);
  if (Number.isFinite(altitude) && altitude >= 18000) {
    return {
      target: "#ff505c",
      trail: "rgba(255, 80, 92, 0.7)"
    };
  }
  if (Number.isFinite(altitude) && altitude >= 10000) {
    return {
      target: "#ff9d35",
      trail: "rgba(255, 157, 53, 0.66)"
    };
  }
  return {
    target: "#e9fff3",
    trail: "rgba(98, 213, 255, 0.45)"
  };
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
  updateProximityAlert();
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

function angularDifference(a, b) {
  const difference = Math.abs(normalizeRadians(a) - normalizeRadians(b));
  return Math.min(difference, Math.PI * 2 - difference);
}

function updateRadarBlipsForWeatherSweep(angle) {
  const currentSweepAngle = normalizeRadians(angle);

  for (const plane of aircraft) {
    if (!isVisibleTraffic(plane)) continue;
    if (milesBetween(center.lat, center.lon, plane.lat, plane.lon) > radiusMiles + 1) continue;

    const targetAngle = planeSweepAngle(plane);
    if (angularDifference(currentSweepAngle, targetAngle) > 0.16) continue;

    const key = aircraftKey(plane);
    const previousBlip = radarBlips.get(key);
    if (previousBlip?.radarSeenAt && Date.now() - previousBlip.radarSeenAt < 450) continue;

    const snapshot = { ...plane, radarSeenAt: Date.now() };
    radarBlips.set(key, snapshot);
    appendTrackHistory(snapshot);
    playContactBlip();
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

async function loadRunwayCache() {
  if (!runwaysCachePromise) {
    runwaysCachePromise = fetch(runwaysCsvUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Runway data returned ${response.status}`);
        return response.text();
      })
      .then(parseRunwaysCsv)
      .catch((error) => {
        console.warn("Unable to load runway data", error);
        return [];
      });
  }

  return runwaysCachePromise;
}

function airportSizeScore(airport) {
  const typeScore = airport.type === "large_airport" ? 3 : airport.type === "medium_airport" ? 2 : 1;
  const longestRunway = Math.max(0, ...(airport.runways || []).map((runway) => Number(runway.lengthFt) || 0));
  return typeScore * 100000 + longestRunway;
}

function pruneLargeRangeAirports(airportMatches) {
  if (radiusMiles < 50) return airportMatches;

  return [...airportMatches]
    .sort((a, b) => airportSizeScore(b) - airportSizeScore(a) || a.distanceMiles - b.distanceMiles)
    .slice(0, 25)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

function attachRunwaysToAirports(airportRows, runwayRows) {
  const runwaysByAirport = new Map();
  for (const runway of runwayRows) {
    if (!runwaysByAirport.has(runway.airportIdent)) runwaysByAirport.set(runway.airportIdent, []);
    runwaysByAirport.get(runway.airportIdent).push(runway);
  }

  return airportRows.map((airport) => ({
    ...airport,
    runways: (runwaysByAirport.get(airport.ident) || [])
      .sort((a, b) => (b.lengthFt || 0) - (a.lengthFt || 0))
      .slice(0, 12)
  }));
}

async function fetchStaticTraffic() {
  const [trafficData, airportRows, runwayRows] = await Promise.all([
    fetchPreferredAircraftFeed(),
    loadAirportCache(),
    loadRunwayCache()
  ]);

  const aircraftRows = (trafficData.aircraft || trafficData.ac || []).map(normalizeAircraft).filter(Boolean);

  const airportContextMiles = radiusMiles * 1.7;
  const airportMatches = pruneLargeRangeAirports(
    attachRunwaysToAirports(airportRows, runwayRows)
    .map((airport) => ({
      ...airport,
      distanceMiles: milesBetween(center.lat, center.lon, airport.lat, airport.lon)
    }))
    .filter((airport) => airport.distanceMiles <= airportContextMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 120)
  );

  return {
    aircraft: aircraftRows,
    airports: airportMatches,
    source: trafficData.displaySource || trafficData.source || "Cellular",
    stale: Boolean(trafficData.stale),
    ageSeconds: trafficData.ageSeconds ?? 0,
    warning: trafficData.warning || ""
  };
}

async function fetchAircraftFeed(baseUrl, { displaySource, timeoutMs = 6500 } = {}) {
  if (!baseUrl) throw new Error("Aircraft source is not configured");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const aircraftUrl = `${baseUrl}/api/aircraft?lat=${center.lat}&lon=${center.lon}&radiusMiles=${radiusMiles}`;

  try {
    const response = await fetch(aircraftUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.detail || `${displaySource || "aircraft source"} returned ${response.status}`);
    }
    return {
      ...data,
      displaySource
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchPreferredAircraftFeed() {
  if (stratusBridgeBaseUrl) {
    try {
      const stratusData = await fetchAircraftFeed(stratusBridgeBaseUrl, {
        displaySource: "Stratus",
        timeoutMs: 1600
      });
      if (stratusData.stale) {
        const age = Number.isFinite(Number(stratusData.ageSeconds)) ? `${Math.round(Number(stratusData.ageSeconds))}s old` : "not receiving packets";
        throw new Error(`Stratus bridge is stale (${age})`);
      }
      return stratusData;
    } catch (error) {
      console.warn("Stratus traffic source unavailable; falling back to cellular source", error);
    }
  }

  if (!adsbProxyBaseUrl) {
    throw new Error("Cloudflare Worker proxy is not configured");
  }

  return fetchAircraftFeed(adsbProxyBaseUrl, {
    displaySource: "Cellular",
    timeoutMs: 6500
  });
}

function airspaceEnvelope() {
  const latPad = radiusMiles / 69 + 0.08;
  const lonPad = radiusMiles / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180))) + 0.08;
  return `${center.lon - lonPad},${center.lat - latPad},${center.lon + lonPad},${center.lat + latPad}`;
}

function weatherZoomLevel() {
  const tileSpanMiles = Math.max(2.5, radiusMiles * 1.4);
  const earthMiles = 24901;
  const zoom = Math.round(Math.log2((earthMiles * Math.cos((center.lat * Math.PI) / 180)) / tileSpanMiles));
  return Math.max(4, Math.min(7, zoom));
}

function latLonToWeatherTile(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: Math.floor(((lon + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale)
  };
}

function weatherTileToLatLon(x, y, zoom) {
  const scale = 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat, lon };
}

function weatherTileEnvelope(zoom) {
  const latPad = radiusMiles / 69;
  const lonPad = radiusMiles / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const north = Math.min(85, center.lat + latPad);
  const south = Math.max(-85, center.lat - latPad);
  const west = center.lon - lonPad;
  const east = center.lon + lonPad;
  const northwest = latLonToWeatherTile(north, west, zoom);
  const southeast = latLonToWeatherTile(south, east, zoom);
  const maxTile = 2 ** zoom - 1;
  const minX = Math.max(0, Math.min(northwest.x, southeast.x) - 1);
  const maxX = Math.min(maxTile, Math.max(northwest.x, southeast.x) + 1);
  const minY = Math.max(0, Math.min(northwest.y, southeast.y) - 1);
  const maxY = Math.min(maxTile, Math.max(northwest.y, southeast.y) + 1);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ x, y, zoom });
    }
  }

  return tiles.slice(0, 64);
}

function loadWeatherTile(url, tile) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve({ ...tile, image });
    image.onerror = reject;
    image.src = url;
  });
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
    const tileSpecs = weatherTileEnvelope(zoom);
    const key = `${frame.path}:${zoom}:${center.lat.toFixed(3)}:${center.lon.toFixed(3)}:${radiusMiles}`;
    if (key === weatherImageKey && weatherTiles.length) return;

    weatherImageLoading = true;
    weatherImageKey = key;
    const tileResults = await Promise.allSettled(
      tileSpecs.map((tile) => loadWeatherTile(`${meta.host}${frame.path}/512/${zoom}/${tile.x}/${tile.y}/2/1_1.png`, tile))
    );
    const loadedTiles = tileResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (weatherImageKey === key) {
      weatherTiles = loadedTiles;
    }
    weatherImageLoading = false;
  } catch (error) {
    weatherImageLoading = false;
    console.warn("Unable to load precipitation layer", error);
  }
}

function drawPrecipitation(scope) {
  if (!showPrecipitation) return;
  ensureWeatherImage();
  if (!weatherTiles.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.58;
  for (const tile of weatherTiles) {
    const nw = weatherTileToLatLon(tile.x, tile.y, tile.zoom);
    const se = weatherTileToLatLon(tile.x + 1, tile.y + 1, tile.zoom);
    const nwPoint = project(nw.lat, nw.lon, scope);
    const sePoint = project(se.lat, se.lon, scope);
    const x = Math.min(nwPoint.x, sePoint.x);
    const y = Math.min(nwPoint.y, sePoint.y);
    const width = Math.abs(sePoint.x - nwPoint.x);
    const height = Math.abs(sePoint.y - nwPoint.y);
    if (width <= 0 || height <= 0) continue;
    ctx.drawImage(tile.image, x, y, width, height);
  }
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
  fetchTraffic({ force: true });
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

async function fetchTraffic({ force = false } = {}) {
  if (trafficFetchInFlight) return;
  if (!force && Date.now() < nextTrafficFetchAt) return;

  trafficFetchInFlight = true;

  try {
    const data = await fetchStaticTraffic();

    aircraft = data.aircraft;
    airports = data.airports;
    lastDataSource = data.source;
    if (data.stale) {
      const age = Number.isFinite(Number(data.ageSeconds)) ? `${Math.round(Number(data.ageSeconds))}s old` : "stale";
      statusEl.textContent = `${lastDataSource} traffic source degraded. Showing cached aircraft data (${age}).`;
    } else {
      statusEl.textContent = gpsActive
        ? `${lastDataSource} traffic active. GPS center at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`
        : aircraft.length
          ? `${lastDataSource} traffic active for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`
          : `${lastDataSource} traffic returned no aircraft for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;
    }
    resolveMissingAircraftTypes(aircraft);
    pruneRadarBlips(aircraft);
    lastFetchAt = Date.now();
    scheduleNextTrafficFetch();
  } catch (error) {
    lastDataSource = "offline";
    scheduleNextTrafficFetch({ failed: true });
    const retrySeconds = Math.max(1, Math.round((nextTrafficFetchAt - Date.now()) / 1000));
    const keepDataHint = aircraft.length ? " Keeping last radar picture." : "";
    statusEl.textContent = `ADS-B feed unavailable: ${error.message}. Retrying in ${retrySeconds}s.${keepDataHint}`;
  } finally {
    trafficFetchInFlight = false;
  }

  renderList();
  updateProximityAlert();
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
            <span>${escapeHtml(friendlyAircraftType(plane) || aircraftType(plane) || "TYPE ?")}</span>
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

  drawHeadingTicks(scope);

  ctx.fillStyle = "rgba(233, 255, 243, 0.72)";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "center";
  for (const cardinal of [
    { label: "N", bearing: 0 },
    { label: "E", bearing: 90 },
    { label: "S", bearing: 180 },
    { label: "W", bearing: 270 }
  ]) {
    const angle = screenAngleForBearing(cardinal.bearing);
    ctx.fillText(cardinal.label, Math.cos(angle) * (scope.radius + 18), Math.sin(angle) * (scope.radius + 18) + 4);
  }
  ctx.restore();
}

function drawHeadingTicks(scope) {
  ctx.save();
  ctx.strokeStyle = "rgba(233, 255, 243, 0.42)";
  ctx.fillStyle = "rgba(233, 255, 243, 0.64)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let bearing = 0; bearing < 360; bearing += 10) {
    const angle = screenAngleForBearing(bearing);
    const isCardinal = bearing % 90 === 0;
    const isLabeled = bearing % 30 === 0 && !isCardinal;
    const length = isLabeled ? 13 : 7;
    const outer = scope.radius - 3;
    const inner = outer - length;

    ctx.lineWidth = isLabeled ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();

    if (isLabeled) {
      const label = String(bearing).padStart(3, "0");
      const labelRadius = scope.radius + 18;
      ctx.font = "700 11px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.fillText(label, Math.cos(angle) * labelRadius, Math.sin(angle) * labelRadius);
    }
  }

  ctx.restore();
}

function drawAirportRunways(airport, scope) {
  if (radiusMiles > 15 || !airport.runways?.length) return false;

  ctx.save();
  ctx.lineCap = "round";
  let drewRunway = false;
  for (const runway of airport.runways) {
    const start = project(runway.leLat, runway.leLon, scope);
    const end = project(runway.heLat, runway.heLon, scope);
    const margin = 70;
    const visible =
      (start.x >= -margin && start.x <= scope.width + margin && start.y >= -margin && start.y <= scope.height + margin) ||
      (end.x >= -margin && end.x <= scope.width + margin && end.y >= -margin && end.y <= scope.height + margin);
    if (!visible) continue;

    const width = Number.isFinite(runway.widthFt) ? Math.max(2.5, Math.min(7, runway.widthFt / 24)) : 3.5;
    ctx.strokeStyle = "rgba(255, 240, 184, 0.82)";
    ctx.lineWidth = width + 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(3, 18, 12, 0.78)";
    ctx.lineWidth = Math.max(1.5, width - 1);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drewRunway = true;
  }
  ctx.restore();
  return drewRunway;
}

function longestRunwayLabelPoint(airport, scope) {
  const runway = [...(airport.runways || [])].sort((a, b) => (b.lengthFt || 0) - (a.lengthFt || 0))[0];
  if (!runway) return null;
  const start = project(runway.leLat, runway.leLon, scope);
  const end = project(runway.heLat, runway.heLon, scope);
  return {
    x: Math.max(start.x, end.x) + 10,
    y: Math.max(start.y, end.y) + 16
  };
}

function airportLabelPosition(airport, text, point, scope) {
  const width = ctx.measureText(text).width;
  let labelX = point.x + 10;
  let labelY = point.y - 9;

  if (airport.ident === "KSDL") {
    const runwayPoint = longestRunwayLabelPoint(airport, scope);
    if (runwayPoint) {
      labelX = runwayPoint.x;
      labelY = runwayPoint.y;
    }
  } else if (airport.ident === "KDVT" || airport.ident === "18AZ") {
    labelX = point.x - width / 2;
    labelY = point.y - 17;
  }

  return {
    x: Math.min(scope.width - width - 8, Math.max(8, labelX)),
    y: Math.min(scope.height - 12, Math.max(15, labelY))
  };
}

function drawAirportLabel(airport, point, scope) {
  const text = airport.ident || airport.iata;
  if (!text) return;

  ctx.save();
  ctx.font = radiusMiles <= 15 ? "850 13px ui-monospace, SFMono-Regular, Consolas, monospace" : "700 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  const label = airportLabelPosition(airport, text, point, scope);
  const height = radiusMiles <= 15 ? 16 : 14;
  if (intersectsAircraftText(textBox(label.x, label.y, text, height))) {
    ctx.restore();
    return;
  }
  ctx.lineWidth = radiusMiles <= 15 ? 5 : 3;
  ctx.strokeStyle = "rgba(2, 5, 3, 0.92)";
  ctx.fillStyle = "rgba(255, 232, 150, 0.96)";
  ctx.strokeText(text, label.x, label.y);
  ctx.fillText(text, label.x, label.y);
  ctx.restore();
}

function drawAirports(scope) {
  ctx.save();
  ctx.font = "700 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  for (const airport of airports) {
    const point = project(airport.lat, airport.lon, scope);
    const margin = 36;
    if (point.x < -margin || point.x > scope.width + margin || point.y < -margin || point.y > scope.height + margin) continue;

    const hasRunwayGraphic = drawAirportRunways(airport, scope);

    if (!hasRunwayGraphic) {
      ctx.strokeStyle = airport.type === "large_airport" ? "rgba(255, 207, 106, 0.95)" : "rgba(255, 207, 106, 0.58)";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = radiusMiles <= 15 ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(point.x - 6, point.y);
      ctx.lineTo(point.x + 6, point.y);
      ctx.moveTo(point.x, point.y - 6);
      ctx.lineTo(point.x, point.y + 6);
      ctx.stroke();
    }
    if (showRadarData) {
      drawAirportLabel(airport, point, scope);
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
    D: { stroke: "rgba(35, 96, 202, 0.92)", fill: "rgba(35, 96, 202, 0.045)", dash: [10, 13] }
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const airspace of airspaces) {
    if (!visibleClasses.has(airspace.classCode)) continue;
    const style = styles[airspace.classCode] || styles.D;
    const labelPoints = [];

    ctx.strokeStyle = style.stroke;
    ctx.fillStyle = style.fill;
    ctx.setLineDash(style.dash);

    for (const ring of airspace.rings) {
      if (ring.length < 2) continue;
      const projectedRing = ring.map((point) => project(point.lat, point.lon, scope));
      labelPoints.push(...projectedRing);
      drawAirspaceRingPath(projectedRing, airspace.classCode === "D");
      ctx.fill();
      ctx.stroke();
    }

    const inScope = labelPoints.filter((point) => point.distance <= radiusMiles * 1.05);
    if (showRadarData && inScope.length) {
      const labelPoint = inScope[Math.floor(inScope.length / 2)];
      const label = `${airspace.classCode} ${airspace.lower}/${airspace.upper}`;
      const labelX = Math.min(scope.width - 76, Math.max(8, labelPoint.x + 5));
      const labelY = Math.min(scope.height - 12, Math.max(18, labelPoint.y - 5));
      if (intersectsAircraftText(textBox(labelX, labelY, label, 14))) continue;
      ctx.setLineDash([]);
      ctx.fillStyle = style.stroke;
      ctx.fillText(label, labelX, labelY);
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawAirspaceRingPath(points, smooth = false) {
  ctx.beginPath();
  const cleanPoints = points.slice();
  const firstPoint = cleanPoints[0];
  const lastPoint = cleanPoints[cleanPoints.length - 1];
  if (firstPoint && lastPoint && Math.hypot(firstPoint.x - lastPoint.x, firstPoint.y - lastPoint.y) < 0.5) {
    cleanPoints.pop();
  }

  if (!smooth || cleanPoints.length < 4) {
    cleanPoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    return;
  }

  const midpoint = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  });
  const last = cleanPoints[cleanPoints.length - 1];
  const first = cleanPoints[0];
  const start = midpoint(last, first);
  ctx.moveTo(start.x, start.y);
  cleanPoints.forEach((point, index) => {
    const next = cleanPoints[(index + 1) % cleanPoints.length];
    const mid = midpoint(point, next);
    ctx.quadraticCurveTo(point.x, point.y, mid.x, mid.y);
  });
  ctx.closePath();
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
  ctx.strokeStyle = altitudeColorStyle(plane).trail;
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

function drawAircraftContact({ plane, point, alpha, highlight, compactLabel }) {
  const highlightMix = highlight?.highlightMix || 0;
  const heading = Number.isFinite(Number(plane.track))
    ? ((Number(plane.track) - radarRotationDegrees() - 90) * Math.PI) / 180
    : -Math.PI / 2;
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
        : altitudeColorStyle(plane).target;
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
    ctx.fillText(compactLabel ? aircraftCompactLabel(plane) : aircraftDisplayLabel(plane), point.x + 13, point.y - 11);
    if (!compactLabel) {
      ctx.fillStyle = "rgba(77, 255, 155, 0.86)";
      ctx.fillText(`${formatAltitude(plane.altitude)} ${formatSpeed(plane.speed)}`, point.x + 13, point.y + 4);
    }
    ctx.restore();
  }
}

function collectAircraftContacts(scope, now) {
  const normalContacts = [];
  const highlightedContacts = [];

  for (const plane of visibleRadarAircraft()) {
    const point = project(plane.lat, plane.lon, scope);
    if (point.distance > radiusMiles) continue;

    const alpha = radarBlipAlpha(plane, now);
    if (alpha <= 0) continue;

    const key = aircraftKey(plane);
    const highlight = aircraftHighlightState(key, now);
    const contact = { plane, point, alpha, highlight };
    if (highlight?.active) highlightedContacts.push(contact);
    else normalContacts.push(contact);
  }

  return [...normalContacts, ...highlightedContacts];
}

function prepareAircraftLabels(scope, now) {
  ctx.save();
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  currentAircraftContacts = collectAircraftContacts(scope, now);
  markCompactAircraftLabels(currentAircraftContacts);
  updateAircraftTextObstacles(currentAircraftContacts);
  ctx.restore();
}

function drawAircraft(scope) {
  ctx.save();
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  aircraftHitAreas = [];
  const normalContacts = [];
  const highlightedContacts = [];

  for (const contact of currentAircraftContacts) {
    if (contact.alpha > 0.12) {
      aircraftHitAreas.push({ key: aircraftKey(contact.plane), x: contact.point.x, y: contact.point.y, plane: contact.plane });
    }
    drawTrack(scope, contact.plane, contact.alpha);
    if (contact.highlight?.active) highlightedContacts.push(contact);
    else normalContacts.push(contact);
  }

  for (const contact of normalContacts) drawAircraftContact(contact);
  for (const contact of highlightedContacts) drawAircraftContact(contact);

  ctx.restore();
}

function drawUserNavigation(scope) {
  if (!gpsActive) return;

  const visibleTrail = gpsTrail.filter((sample) => Date.now() - sample.at <= 30 * 60 * 1000);
  gpsTrail = visibleTrail;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();

  if (visibleTrail.length >= 2) {
    ctx.strokeStyle = "rgba(233, 255, 243, 0.72)";
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    visibleTrail.forEach((sample, index) => {
      const point = project(sample.lat, sample.lon, scope);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const heading = activeTrackHeadingDegrees() ?? gpsTrackDegrees ?? compassHeadingDegrees ?? 0;
  const headingAngle = activeTrackHeadingDegrees() !== null ? -Math.PI / 2 : screenAngleForBearing(heading);
  ctx.save();
  ctx.translate(scope.cx, scope.cy);
  ctx.rotate(headingAngle);
  ctx.fillStyle = "rgba(5, 58, 38, 0.96)";
  ctx.strokeStyle = "rgba(112, 255, 181, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(1, -9, -8, -5);
  ctx.quadraticCurveTo(-4, 0, -8, 5);
  ctx.quadraticCurveTo(1, 9, 14, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-1, 0, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(2, 18, 12, 0.9)";
  ctx.fill();
  ctx.restore();

  if (gpsSpeedKts >= 2 && Number.isFinite(gpsTrackDegrees)) {
    const projected = destinationPoint(center.lat, center.lon, gpsTrackDegrees, (gpsSpeedKts / 3600) * 30 * 1.15078);
    const projectedPoint = project(projected.lat, projected.lon, scope);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(scope.cx, scope.cy);
    ctx.lineTo(projectedPoint.x, projectedPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(projectedPoint.x, projectedPoint.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fill();
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

function weatherSectorAngles() {
  const forward = weatherForwardBearing();
  return {
    left: screenAngleForBearing(forward - wxSectorDegrees),
    right: screenAngleForBearing(forward + wxSectorDegrees)
  };
}

function weatherSectorPath(scope) {
  const { left, right } = weatherSectorAngles();
  ctx.beginPath();
  ctx.moveTo(scope.cx, scope.cy);
  ctx.lineTo(scope.cx + Math.cos(left) * scope.radius, scope.cy + Math.sin(left) * scope.radius);
  ctx.arc(scope.cx, scope.cy, scope.radius, left, right, false);
  ctx.closePath();
}

function withWeatherSectorClip(scope, draw) {
  ctx.save();
  weatherSectorPath(scope);
  ctx.clip();
  draw();
  ctx.restore();
}

function weatherForwardBearing() {
  if (Number.isFinite(gpsTrackDegrees) && gpsSpeedKts >= 0.8) return gpsTrackDegrees;
  if (Number.isFinite(compassHeadingDegrees)) return compassHeadingDegrees;
  return activeTrackHeadingDegrees() ?? 0;
}

function weatherSectorSweepBearing(progress) {
  const triangle = progress < 0.5 ? progress * 4 - 1 : 3 - progress * 4;
  return normalizedDegrees(weatherForwardBearing() + triangle * wxSectorDegrees);
}

function drawWeatherSector(scope, sweepBearing) {
  const { left: leftAngle, right: rightAngle } = weatherSectorAngles();
  const sweepAngle = screenAngleForBearing(sweepBearing);
  const palette = sweepPalettes[sweepColor] || sweepPalettes.green;

  ctx.save();
  ctx.translate(scope.cx, scope.cy);

  ctx.strokeStyle = "rgba(233, 255, 243, 0.82)";
  ctx.lineWidth = 2;
  for (const angle of [leftAngle, rightAngle]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * scope.radius, Math.sin(angle) * scope.radius);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(233, 255, 243, 0.34)";
  ctx.setLineDash([2, 10]);
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, scope.radius * fraction, leftAngle, rightAngle, false);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 207, 106, 0.48)";
  ctx.lineWidth = 1.1;
  for (let offset = -60; offset <= 60; offset += 30) {
    if (offset === -60 || offset === 60) continue;
    const angle = screenAngleForBearing(weatherForwardBearing() + offset);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * scope.radius * 0.08, Math.sin(angle) * scope.radius * 0.08);
    ctx.lineTo(Math.cos(angle) * scope.radius, Math.sin(angle) * scope.radius);
    ctx.stroke();
  }

  const labelValues = [2, 5, 10, 20, 50, 100].filter((value) => value <= radiusMiles);
  ctx.fillStyle = "rgba(233, 255, 243, 0.74)";
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const value of labelValues) {
    const radius = (value / radiusMiles) * scope.radius;
    const x = Math.cos(rightAngle) * radius + 8;
    const y = Math.sin(rightAngle) * radius;
    ctx.fillText(`${value}`, x, y);
  }

  for (let index = 0; index < 22; index += 1) {
    const progress = index / 20;
    const segmentAngle = sweepAngle - progress * 0.52;
    const alpha = (1 - progress) ** 2 * 0.24;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, scope.radius, segmentAngle - 0.02, segmentAngle + 0.02);
    ctx.closePath();
    ctx.fillStyle = `rgba(${palette.trail}, ${alpha})`;
    ctx.fill();
  }

  ctx.rotate(sweepAngle);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2.4;
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
  const scope = weatherMode ? weatherScope(width, height) : radarScope(width, height);

  const sweepProgress = ((now / 1000) % sweepSeconds) / sweepSeconds;
  const sweepBucket = Math.floor(now / (sweepSeconds * 1000));
  const angle = sweepProgress * Math.PI * 2 - Math.PI / 2;
  const wxProgress = ((now / 1000) % wxSweepSeconds) / wxSweepSeconds;
  const wxSweepBucket = Math.floor(now / (wxSweepSeconds * 1000));
  const wxSweepBearing = weatherSectorSweepBearing(wxProgress);
  const wxAngle = screenAngleForBearing(wxSweepBearing);

  if (running && !weatherMode && sweepBucket !== lastSweepBucket) {
    lastSweepBucket = sweepBucket;
    playSweepTick();
  }

  if (running && weatherMode && wxSweepBucket !== lastWxSweepBucket) {
    lastWxSweepBucket = wxSweepBucket;
    playSweepTick();
  }

  if (running && Date.now() >= nextTrafficFetchAt) {
    fetchTraffic();
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020503";
  ctx.fillRect(0, 0, width, height);

  pruneExpiredRadarBlips();
  if (weatherMode) updateRadarBlipsForWeatherSweep(wxAngle);
  else updateRadarBlipsForSweep(angle);
  prepareAircraftLabels(scope, Date.now());
  if (weatherMode) {
    withWeatherSectorClip(scope, () => {
      drawPrecipitation(scope);
      drawAirspace(scope);
      drawAirports(scope);
      drawAircraft(scope);
      drawUserNavigation(scope);
    });
    drawWeatherSector(scope, wxSweepBearing);
  } else {
    drawGrid(scope);
    drawPrecipitation(scope);
    drawAirspace(scope);
    drawAirports(scope);
    drawAircraft(scope);
    drawUserNavigation(scope);
    drawSweep(scope, angle);
  }
  if (showRadarData) drawHud(scope);
  updateProximityAlert();
  updateWxNearestTarget();

  requestAnimationFrame(render);
}

function setRange(nextRange) {
  radiusMiles = allowedRanges.includes(nextRange) ? nextRange : 20;
  resetWeatherImage();
  for (const button of rangeButtons.querySelectorAll("button")) {
    button.classList.toggle("active", Number(button.dataset.range) === radiusMiles);
  }
  updateBottomRangeButton();
}

function updateBottomRangeButton() {
  if (!wxRangeButton) return;

  if (weatherMode) {
    wxRangeButton.hidden = false;
    wxRangeButton.textContent = `${radiusMiles} NM`;
    wxRangeButton.setAttribute("aria-label", "Change weather radar range");
    return;
  }

  if (trafficAlertActive) {
    wxRangeButton.hidden = false;
    wxRangeButton.textContent = radiusMiles === 2 ? "5 NM" : "2 NM";
    wxRangeButton.setAttribute("aria-label", "Change traffic alert range");
    return;
  }

  wxRangeButton.hidden = true;
}

function setWeatherMode(enabled) {
  weatherMode = Boolean(enabled);
  shell.classList.toggle("wx-mode", weatherMode);
  if (radarModeToggle) {
    radarModeToggle.classList.toggle("active", weatherMode);
    radarModeToggle.textContent = weatherMode ? "360" : "ARC";
    radarModeToggle.setAttribute("aria-pressed", String(weatherMode));
    radarModeToggle.setAttribute("aria-label", weatherMode ? "Full circle radar mode" : "Forward radar mode");
  }
  updateBottomRangeButton();
  updateWxNearestTarget();
  previousSweepAngle = null;
}

function setPrecipitationLayer(enabled) {
  showPrecipitation = Boolean(enabled);
  if (wxToggle) {
    wxToggle.classList.toggle("active", showPrecipitation);
    wxToggle.setAttribute("aria-pressed", String(showPrecipitation));
    wxToggle.setAttribute("aria-label", showPrecipitation ? "Hide precipitation layer" : "Show precipitation layer");
  }
  if (showPrecipitation) ensureWeatherImage();
}

rangeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  setRange(Number(button.dataset.range));
  fetchAirspace();
  fetchTraffic({ force: true });
});

radarModeToggle?.addEventListener("click", () => {
  if (!weatherMode) {
    previousRangeBeforeWx = radiusMiles;
    if (!wxRanges.includes(radiusMiles)) setRange(10);
  } else if (allowedRanges.includes(previousRangeBeforeWx)) {
    setRange(previousRangeBeforeWx);
  }
  setWeatherMode(!weatherMode);
  fetchTraffic({ force: true });
});

wxToggle?.addEventListener("click", () => {
  setPrecipitationLayer(!showPrecipitation);
});

wxRangeButton?.addEventListener("click", () => {
  if (!weatherMode) {
    const nextRange = radiusMiles === 2 ? 5 : 2;
    setRange(nextRange);
    fetchAirspace();
    fetchTraffic({ force: true });
    return;
  }

  const currentIndex = wxRanges.indexOf(radiusMiles);
  const nextRange = wxRanges[(currentIndex + 1) % wxRanges.length] || 5;
  setRange(nextRange);
  fetchAirspace();
  fetchTraffic({ force: true });
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

function openLegend() {
  legendModal.hidden = false;
}

function closeLegend() {
  legendModal.hidden = true;
}

function openAircraftDetails(plane) {
  if (!plane) return;
  const distance = milesBetween(center.lat, center.lon, plane.lat, plane.lon);
  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);
  const friendlyType = friendlyAircraftType(plane) || "Unknown aircraft type";
  aircraftTitle.innerHTML = plane.nNumber
    ? `Aircraft - <a href="${faaRegistryUrl(plane.nNumber)}" target="_blank" rel="noopener noreferrer">${escapeHtml(plane.nNumber)}</a>`
    : "Aircraft";
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
  gpsTrackDegrees = null;
  gpsSpeedKts = 0;
  gpsAltitudeFt = null;
  compassHeadingDegrees = null;
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
  gpsTrail = [];
  lastGpsTrailAt = 0;
  gpsTrackDegrees = null;
  gpsSpeedKts = 0;
  gpsAltitudeFt = null;
  statusEl.textContent = "Requesting GPS position...";
  queueCompassHeadingEnable();

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const previousCenter = { ...center };
      const movedMiles = milesBetween(center.lat, center.lon, lat, lon);
      const needsAirspace = getVisibleAirspaceClasses().size && (!lastAirspaceKey || !airspaces.length);
      const shouldRefresh = movedMiles > 0.05 || !lastFetchAt || needsAirspace;
      const speedMps = Number(position.coords.speed);
      const heading = Number(position.coords.heading);
      const altitudeMeters = Number(position.coords.altitude);
      gpsSpeedKts = Number.isFinite(speedMps) && speedMps >= 0 ? speedMps * 1.94384 : 0;
      gpsAltitudeFt = Number.isFinite(altitudeMeters) ? altitudeMeters * 3.28084 : null;
      if (Number.isFinite(heading)) {
        gpsTrackDegrees = heading;
      } else if (movedMiles > 0.003) {
        gpsTrackDegrees = bearingDegrees(previousCenter.lat, previousCenter.lon, lat, lon);
      }

      latInput.value = lat.toFixed(4);
      lonInput.value = lon.toFixed(4);
      center = { lat, lon };
      resetWeatherImage();
      statusEl.textContent = `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`;
      const now = Date.now();
      if (!lastGpsTrailAt || now - lastGpsTrailAt >= 30000) {
        gpsTrail.push({ lat, lon, at: now });
        gpsTrail = gpsTrail.slice(-120);
        lastGpsTrailAt = now;
      }
      updateProximityAlert();

      if (shouldRefresh) {
        tracks.clear();
        radarBlips.clear();
        previousSweepAngle = null;
        lastAirspaceKey = "";
        fetchAirspace();
        fetchTraffic({ force: true });
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
    const limit = plane ? breadcrumbLimitForAircraft(plane) : breadcrumbBaseLimit;
    tracks.set(key, history.slice(-limit));
  }
}

settingsOpen.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
legendOpen.addEventListener("click", openLegend);
legendClose.addEventListener("click", closeLegend);

panelToggle.addEventListener("click", () => {
  shell.classList.toggle("panel-collapsed");
  updatePanelToggle();
  window.setTimeout(resizeCanvas, 240);
});

proximityAlertEl?.addEventListener("click", () => {
  proximityAlertSolid = true;
  proximityAlertEl.classList.add("solid");
});

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

legendModal.addEventListener("click", (event) => {
  if (event.target === legendModal) closeLegend();
});

aircraftClose.addEventListener("click", closeAircraftDetails);

aircraftModal.addEventListener("click", (event) => {
  if (event.target === aircraftModal) closeAircraftDetails();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  if (event.key === "Escape" && !legendModal.hidden) closeLegend();
  if (event.key === "Escape" && !aircraftModal.hidden) closeAircraftDetails();
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

radarSoundStyleSelect.value = radarSoundStyle;
setWeatherMode(false);
setPrecipitationLayer(showPrecipitation);
installRadarAudioRecovery();
queueRadarAudioUnlock();

radarSoundStyleSelect.addEventListener("change", async () => {
  const selectedStyle = [
    "off",
    "radar",
    "tick",
    "softTick",
    "sharpTick",
    "geigerClick",
    "lowTick",
    "glassPing",
    "submarine",
    "chirp",
    "sonar"
  ].includes(radarSoundStyleSelect.value)
    ? radarSoundStyleSelect.value
    : "softTick";
  radarSoundsEnabled = selectedStyle !== "off";
  radarSoundStyle = radarSoundsEnabled ? selectedStyle : "softTick";
  audioUnlocked = false;
  if (!radarSoundsEnabled) return;
  if (await unlockRadarAudio()) {
    playContactBlip();
  } else {
    queueRadarAudioUnlock();
  }
});

orientationModeSelect.addEventListener("change", () => {
  orientationMode = orientationModeSelect.value === "track" ? "track" : "north";
  if (orientationMode === "track") queueCompassHeadingEnable();
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
window.addEventListener("resize", updateProximityAlert);
if ("ResizeObserver" in window && radarWrap) {
  const radarResizeObserver = new ResizeObserver(() => {
    resizeCanvas();
    updateProximityAlert();
  });
  radarResizeObserver.observe(radarWrap);
}

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
  fetchTraffic({ force: true });
}
requestAnimationFrame(render);
