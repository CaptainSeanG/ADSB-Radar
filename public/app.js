import {
  deriveConfirmedMotion,
  distanceMilesBetween,
  projectConfirmedTraffic,
  trafficSymbolScreenAngleDegrees
} from "./traffic-prediction.js?v=20260821-2";
import {
  classifyInternetPositionObservation,
  coordinatesMateriallyChanged,
  sourcePositionTimestamp
} from "./traffic-ingestion.js";
import {
  displaySweepBearing,
  sweepCrossedBearing,
  sweepPaintDecision
} from "./traffic-sweep.js?v=20260821-2";
import { FaaAircraftRegistry, normalizeIcaoHex } from "./aircraft-registry.js?v=20260822-2";

const canvas = document.querySelector("#radar");
const ctx = canvas.getContext("2d");
const APP_ROLLOUT_VERSION = "2026.08.22-r2";
const APP_COPYRIGHT_NOTICE = "Copyright 2026 CaptainSeanG. All rights reserved.";
const radarWrap = document.querySelector(".radar-wrap");
const shell = document.querySelector(".shell");
const form = document.querySelector("#controls");
const panelToggle = document.querySelector("#panelToggle");
const themeToggle = document.querySelector("#themeToggle");
const radarModeToggle = document.querySelector("#radarModeToggle");
const wxToggle = document.querySelector("#wxToggle");
const rangeIndicator = document.querySelector("#rangeIndicator");
const altitudeBracketButton = document.querySelector("#altitudeBracketButton");
const arcHeadingOverrideEl = document.querySelector("#arcHeadingOverride");
const wxNearestTarget = document.querySelector("#wxNearestTarget");
const quickNotes = document.querySelector("#quickNotes");
const quickNotesCanvas = document.querySelector("#quickNotesCanvas");
const quickNotesAtcPad = document.querySelector("#quickNotesAtcPad");
const quickNotesClear = document.querySelector("#quickNotesClear");
const airportSelect = document.querySelector("#airportSelect");
const coordRow = document.querySelector("#coordRow");
const latInput = document.querySelector("#lat");
const lonInput = document.querySelector("#lon");
const airspaceToggles = document.querySelector("#airspaceToggles");
const smallAirportsToggle = document.querySelector("#smallAirportsToggle");
const settingsOpen = document.querySelector("#settingsOpen");
const radarSettingsOpen = document.querySelector("#radarSettingsOpen");
const settingsClose = document.querySelector("#settingsClose");
const settingsModal = document.querySelector("#settingsModal");
const trackingOpen = document.querySelector("#trackingOpen");
const radarTrackingOpen = document.querySelector("#radarTrackingOpen");
const trackingClose = document.querySelector("#trackingClose");
const trackingModal = document.querySelector("#trackingModal");
const trackingForm = document.querySelector("#trackingForm");
const trackingNNumberInput = document.querySelector("#trackingNNumber");
const trackingCriterionSelect = document.querySelector("#trackingCriterion");
const trackingValueInput = document.querySelector("#trackingValue");
const trackingIsolateToggle = document.querySelector("#trackingIsolateToggle");
const trackingClear = document.querySelector("#trackingClear");
const trackingStatus = document.querySelector("#trackingStatus");
const legendOpen = document.querySelector("#legendOpen");
const legendClose = document.querySelector("#legendClose");
const legendModal = document.querySelector("#legendModal");
const deviceThermalStatus = document.querySelector("#deviceThermalStatus");
const groundTrafficToggle = document.querySelector("#groundTrafficToggle");
const flightLevelsToggle = document.querySelector("#flightLevelsToggle");
const radarDataToggle = document.querySelector("#radarDataToggle");
const performanceModeSelect = document.querySelector("#performanceModeSelect");
const performanceTelemetry = document.querySelector("#performanceTelemetry");
const radarSoundStyleSelect = document.querySelector("#radarSoundStyle");
const orientationModeSelect = document.querySelector("#orientationMode");
const settingsVersionEl = document.querySelector("#settingsVersion");
const aircraftModal = document.querySelector("#aircraftModal");
const aircraftTitle = document.querySelector("#aircraftTitle");
const aircraftClose = document.querySelector("#aircraftClose");
const aircraftTrack = document.querySelector("#aircraftTrack");
const aircraftDetail = document.querySelector("#aircraftDetail");
const statusEl = document.querySelector("#status");
const stratusDiagnosticsEl = document.querySelector("#stratusDiagnostics");
const dataSourceIndicator = document.querySelector("#dataSourceIndicator");
const dataSourceLabel = document.querySelector("#dataSourceLabel");
const lastUpdateEl = document.querySelector("#lastUpdate");
const aircraftListEl = document.querySelector("#aircraftList");
const proximityAlertEl = document.querySelector("#proximityAlert");
const trackingAlertEl = document.querySelector("#trackingAlert");
const airportSearchInput = document.querySelector("#airportSearch");
const airportSearchResults = document.querySelector("#airportSearchResults");
const airportSearchOpen = document.querySelector("#airportSearchOpen");
const airportSearchLabel = document.querySelector("#airportSearchLabel");
const airportSearchModal = document.querySelector("#airportSearchModal");
const airportSearchClose = document.querySelector("#airportSearchClose");

window.ADSB_RADAR_OWNERSHIP = Object.freeze({
  product: "ADSB Radar",
  rollout: APP_ROLLOUT_VERSION,
  copyright: APP_COPYRIGHT_NOTICE,
  owner: "CaptainSeanG"
});

const sweepSeconds = 3.4;
const wxSweepSeconds = 2.6;
const wxSectorDegrees = 50;
const radarFadeMs = sweepSeconds * 3 * 1000;
const allowedRanges = [2, 5, 10, 15, 20, 50, 100];
const gpsTrackThresholdKts = 5 * 0.868976;
const closeRangeNearestTargetMiles = 20;
const isAndroidWeb = /\bAndroid\b/i.test(window.navigator.userAgent || "") && !window.webkit?.messageHandlers?.stratus;
if (isAndroidWeb) {
  document.body.classList.add("android-web");
  document.documentElement.classList.add("android-web");
}
const platformColors = isAndroidWeb
  ? {
      green: "#00ff66",
      greenRgb: "0, 255, 102",
      red: "#ff1744",
      redRgb: "255, 23, 68",
      redFill: "#d5001f",
      safeGreen: "rgba(0, 255, 102, 0.96)",
      conflictRed: "rgba(255, 23, 68, 0.98)"
    }
  : {
      green: "#4dff9b",
      greenRgb: "77, 255, 155",
      red: "#ff505c",
      redRgb: "255, 80, 92",
      redFill: "#9e0010",
      safeGreen: "rgba(132, 255, 194, 0.9)",
      conflictRed: "rgba(255, 80, 92, 0.95)"
    };
const sweepPalettes = {
  green: {
    trail: platformColors.greenRgb,
    line: isAndroidWeb ? "rgba(0, 255, 102, 0.98)" : "rgba(148, 255, 199, 0.96)"
  },
  orange: {
    trail: "255, 155, 64",
    line: "rgba(255, 180, 92, 0.96)"
  }
};
const radarThemes = {
  dark: {
    background: "#020503",
    grid: "rgba(90, 255, 163, 0.22)",
    boundary: "rgba(98, 213, 255, 0.38)",
    headingTicks: "rgba(233, 255, 243, 0.42)",
    headingText: "rgba(233, 255, 243, 0.64)",
    cardinalText: "rgba(233, 255, 243, 0.72)",
    aircraftText: "rgba(233, 255, 243, 0.92)",
    aircraftData: "rgba(77, 255, 155, 0.86)",
    hud: "rgba(233, 255, 243, 0.75)",
    lowTarget: "rgba(233, 255, 243, 0.9)",
    midTarget: "rgba(255, 157, 53, 0.9)",
    lowTrail: "rgba(98, 213, 255, 0.45)",
    navTrail: "rgba(233, 255, 243, 0.72)",
    navProjection: "rgba(255, 255, 255, 0.82)",
    verticalTrendSafe: platformColors.safeGreen,
    verticalTrendConflict: platformColors.conflictRed,
    arcPrimary: "rgba(233, 255, 243, 0.82)",
    arcSecondary: "rgba(233, 255, 243, 0.34)",
    arcText: "rgba(233, 255, 243, 0.78)",
    arcHeadingTape: "rgba(98, 213, 255, 0.86)",
    arcHeadingBox: "rgba(98, 213, 255, 0.98)"
  },
  light: {
    background: "#8fa79a",
    scopeBackground: "#d8eadf",
    grid: "rgba(0, 95, 58, 0.28)",
    boundary: "rgba(0, 92, 145, 0.55)",
    headingTicks: "rgba(0, 55, 48, 0.48)",
    headingText: "rgba(0, 42, 38, 0.84)",
    cardinalText: "rgba(0, 25, 22, 0.94)",
    aircraftText: "rgba(0, 29, 24, 0.94)",
    aircraftData: "rgba(0, 112, 64, 0.9)",
    hud: "rgba(0, 44, 35, 0.86)",
    lowTarget: "rgba(0, 0, 0, 0.9)",
    midTarget: "rgba(181, 76, 0, 0.96)",
    lowTrail: "rgba(0, 0, 0, 0.56)",
    navTrail: "rgba(37, 42, 156, 0.8)",
    navProjection: "rgba(78, 24, 151, 0.86)",
    verticalTrendSafe: "rgba(0, 128, 72, 0.92)",
    verticalTrendConflict: "rgba(190, 0, 32, 0.95)",
    arcPrimary: "rgba(0, 0, 0, 0.82)",
    arcSecondary: "rgba(0, 0, 0, 0.3)",
    arcText: "rgba(0, 0, 0, 0.8)",
    arcHeadingTape: "rgba(0, 58, 142, 0.92)",
    arcHeadingBox: "rgba(98, 213, 255, 0.98)"
  }
};
const airportsCsvUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const runwaysCsvUrl = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const bundledAirportsUrl = new URL("./data/offline-airports.json", import.meta.url).href;
const bundledAirspaceUrl = new URL("./data/offline-airspace.json", import.meta.url).href;
const bundledTileIndexUrl = new URL("./data/tiles/index.json", import.meta.url).href;
const bundledTilesBaseUrl = new URL("./data/tiles/", import.meta.url);
const weatherMapsUrl = "https://api.rainviewer.com/public/weather-maps.json";
const airspaceQueryUrl =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query";
const specialUseAirspaceQueryUrl =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0/query";
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
const internetTrafficPollMs = 1500;
const internetTrafficStalePollMs = 2500;
const stratusBridgeBaseUrl = (
  stratusUrlFromQuery ||
  window.localStorage.getItem("ADSB_RADAR_STRATUS_URL") ||
  window.ADSB_RADAR_STRATUS_URL ||
  ""
).replace(/\/$/, "");
const nativeStratusHandler = window.webkit?.messageHandlers?.stratus || null;
const trafficDebugEnabled =
  queryParams.get("debug") === "traffic" ||
  queryParams.get("debugTraffic") === "1" ||
  window.ADSB_RADAR_DEBUG_TRAFFIC === true;
let nativeStratusRequestId = 0;
document.body.classList.toggle("native-app", Boolean(nativeStratusHandler));
document.body.classList.toggle("traffic-debug", trafficDebugEnabled);
const tracks = new Map();
const aircraftTypeCache = new Map();
const faaAircraftRegistry = new FaaAircraftRegistry();
const radarBlips = new Map();
const trafficTargetStates = new Map();
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
const breadcrumbBaseLimit = 10;
const slowAircraftBreadcrumbMultiplier = 2;
const trackedBreadcrumbLimit = 100;
const trackedBreadcrumbRangeMiles = 100;
let sweepColor = "orange";
let showGroundTraffic = false;
let showFlightLevelsTraffic = true;
let showRadarData = true;
const smallAirportsPreferenceKey = "ADSB_RADAR_SMALL_AIRPORTS";
const savedSmallAirportsPreference = window.localStorage.getItem(smallAirportsPreferenceKey);
let showSmallAirports = savedSmallAirportsPreference === "true";
const savedWxDisplayMode = window.localStorage.getItem("ADSB_RADAR_WX_DISPLAY_MODE");
let wxDisplayMode = ["off", "on", "wxOnly"].includes(savedWxDisplayMode) ? savedWxDisplayMode : "on";
let showPrecipitation = wxDisplayMode !== "off";
const performanceModeStorageKey = "ADSB_RADAR_PERFORMANCE_MODE";
const performanceModeSelectionKey = "ADSB_RADAR_PERFORMANCE_MODE_USER_SELECTED";
const savedPerformanceMode = window.localStorage.getItem(performanceModeStorageKey);
const savedPerformanceModeWasUserSelected =
  window.localStorage.getItem(performanceModeSelectionKey) === "true";
let performanceMode = ["cool", "reduced", "fast"].includes(savedPerformanceMode)
  ? savedPerformanceMode === "cool" && !savedPerformanceModeWasUserSelected
    ? "reduced"
    : savedPerformanceMode
  : "reduced";
let reducedLoad = performanceMode !== "fast";
let lightTheme = window.localStorage.getItem("ADSB_RADAR_THEME") === "light";
let radarSoundsEnabled = true;
let radarSoundStyle = "softTick";
const savedOrientationMode = window.localStorage.getItem("ADSB_RADAR_ORIENTATION");
const deviceCanReportCompass = Boolean(nativeStratusHandler) || typeof DeviceOrientationEvent !== "undefined";
let orientationMode = ["north", "track"].includes(savedOrientationMode)
  ? savedOrientationMode
  : deviceCanReportCompass
    ? "track"
    : "north";
let weatherMode = false;
let previousRangeBeforeWx = 10;
let previousOrientationBeforeArc = "north";
let aircraft = [];
let airports = [];
let airspaces = [];
const airportControlledAirspaceCache = new Map();
let airspaceDatasetVersion = 0;
let airspaceLayerCache = null;
let airspaceLabelAnchorCache = new Map();
let airspaceLastTileIds = [];
let running = true;
let lastSweepBucket = -1;
let lastWxSweepBucket = -1;
let previousSweepAngle = null;
let previousRadarSweepBearing = null;
let previousWxTrafficSweepBearing = null;
let sweepSequence = 0;
let trafficPositionSequence = 0;
let lastFetchAt = 0;
let lastDataSource = "standby";
let lastStatusText = "";
let lastStratusReceiverState = "";
let trafficFetchInFlight = false;
let trafficBackoffMs = 0;
let nextTrafficFetchAt = 0;
let trafficPumpTimer = null;
let lastTrafficPipelineDebugAt = 0;
let pixelRatio = window.devicePixelRatio || 1;
let airportsCachePromise = null;
let runwaysCachePromise = null;
let bundledAirspacePromise = null;
let bundledTileIndexPromise = null;
const bundledAirportTilePromises = new Map();
const bundledAirspaceTilePromises = new Map();
let airportRowsCache = null;
let airportRowsCacheTileKey = "";
let nationwideAirportSearchPromise = null;
let selectedAirportLabel = "Use GPS location";
let runwayRowsCache = null;
let airportCacheRetryAt = 0;
let runwayCacheRetryAt = 0;
let airportRefreshInFlight = false;
let runwayRefreshInFlight = false;
let offlineAirportDataActive = false;
let offlineAirspaceDataActive = false;
let lastAirspaceKey = "";
let aircraftHitAreas = [];
let currentAircraftContacts = [];
let aircraftTextObstacles = [];
let gpsWatchId = null;
let gpsActive = false;
let gpsTrackDegrees = null;
let gpsSpeedKts = 0;
let gpsAltitudeFt = null;
let stratusOwnshipActive = false;
let lastStratusOwnshipAt = 0;
let stratusTrackDegrees = null;
let stratusTrackSpeedKts = 0;
let stratusHeadingDegrees = null;
let lastStratusHeadingAt = 0;
let stratusAutoTrackUpEnabled = false;
let arcForwardHeadingDegrees = null;
let lastArcForwardHeadingAt = 0;
let arcHeadingOverrideDegrees = null;
let arcHeadingOverrideStartedAt = 0;
let arcHeadingOverrideUntil = 0;
let compassHeadingDegrees = null;
let lastCompassHeadingAt = 0;
let compassPermissionRequested = false;
let gpsTrail = [];
let lastGpsTrailAt = 0;
let weatherMeta = null;
let weatherMetaFetchedAt = 0;
let weatherTiles = [];
let weatherImageKey = "";
let weatherImageLoading = false;
let weatherImageRetryAt = 0;
let stratusWeatherData = null;
let stratusAhrsData = null;
let audioCtx = null;
let audioMaster = null;
let audioLimiter = null;
let lastContactSoundAt = 0;
let lastTrafficAlertSoundAt = 0;
let audioUnlocked = false;
let proximityAlertKey = "";
let proximityAlertSolid = false;
let proximityAlertAudioLevel = 1;
let proximityHighlightLastAt = 0;
let proximityDivergingSince = 0;
let trafficAlertActive = false;
let preparingTrafficAlertUI = false;
let returnToArcAfterThreat = false;
let manualThreatFocusKey = "";
let returnToArcAfterManualThreat = false;
let dismissedTrafficAlertKey = "";
let wxNearestTargetKey = "";
const altitudeBracketPreferenceKey = "ADSB_RADAR_ALTITUDE_BRACKET_FT";
const savedAltitudeBracketValue = window.localStorage.getItem(altitudeBracketPreferenceKey);
const savedAltitudeBracket = Number(savedAltitudeBracketValue);
let altitudeBracketFt =
  savedAltitudeBracketValue !== null && [0, 500, 1000].includes(savedAltitudeBracket)
    ? savedAltitudeBracket || null
    : 1000;
let trackedAircraft = loadTrackedAircraft();
let trackedAircraftClearedUntil = 0;
let quickNoteStrokes = [];
let activeQuickNoteStroke = null;
let quickNotesText = "";
let quickNotesClearTimer = null;
let quickNotesClearStartedAt = 0;
let lastRenderedAt = 0;
let renderLoopScheduled = false;
let scratchpadPaused = false;
let lastWeatherEnsureAt = 0;
let latestDeviceStatus = null;
let deviceStatusRefreshInFlight = false;
let lastDeviceStatusRefreshAt = 0;
let airportContextRequestId = 0;
const renderStats = {
  frames: 0,
  slowFrames: 0,
  totalRenderMs: 0,
  lastFrameAt: 0,
  lastReportAt: 0,
  fps: 0,
  averageRenderMs: 0,
  slowPercent: 0
};
const trafficPipelineDiagnostics = {
  lastRangeChangeAt: 0,
  lastRangeChangeValue: radiusMiles,
  lastFetchStartedAt: 0,
  lastFetchCompletedAt: 0,
  internetLastRequestStartedAt: 0,
  internetLastRequestCompletedAt: 0,
  internetLastRequestDurationMs: 0,
  internetLastSuccessAt: 0,
  internetLastHttpStatus: null,
  internetLastError: "",
  internetLastDataAgeSeconds: null,
  internetLastNextRefreshEligibleSeconds: null,
  internetRequestTimestamps: [],
  internetSuccessTimestamps: [],
  internetLastTargetCount: 0,
  internetLastProvider: "",
  internetLastSourceUrl: "",
  internetLastStoreMutationAt: 0,
  internetLastSnapshotId: "",
  internetLastSnapshotHash: "",
  internetLastCacheSource: "",
  internetLastUpstreamFetchedAt: null,
  internetLastDataTimestamp: null,
  selectedTrafficSource: "none",
  selectedTrafficSourceReason: "startup",
  lastStratusActive: false,
  lastStratusPacketAgeSeconds: null,
  lastInternetPollingActive: false,
  airspaceLoadedTileIds: [],
  airspaceFeatureCount: 0,
  airspaceDuplicateFeatureCount: 0,
  airspaceLayoutInvalidationReason: "startup",
  airspaceLayoutRecalculationTimestamps: [],
  airspaceDrawTimestamps: [],
  airspaceRedrawsPerMinute: 0,
  airspaceLabelLayoutRecalculationsPerMinute: 0,
  lastNativeRequestAt: 0,
  lastNativeWebResponseAt: 0,
  lastNativePayloadGeneratedAt: 0,
  lastJsTrafficStateUpdateAt: 0,
  lastRadarTrafficRenderAt: 0,
  lastTrafficRenderCount: 0,
  lastRenderTimerAliveAt: 0,
  sweepCount: 0,
  sweepPeriodSeconds: sweepSeconds,
  freshTargetsThisSweep: 0,
  fadingTargetsThisSweep: 0,
  removedTargetsThisSweep: 0,
  debugTargetKey: "",
  debugTargetState: null,
  predictionCorrections: [],
  predictedTargetsThisSweep: 0,
  jsPayloadsReceived: 0,
  jsPayloadTimestamps: [],
  lastBridgeState: "waiting",
  lastStaleLogKey: ""
};

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
  const isProximityAlert = key === proximityAlertKey && trafficAlertActive;
  const pulsePeriod = isProximityAlert ? 760 : 1500;
  const pulseWave = (Math.sin((elapsed / pulsePeriod) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const baseScale = isProximityAlert ? 1.85 : 1;
  const scale = baseScale + pulseWave * (isProximityAlert ? 1.25 : 2);

  return { scale, highlightMix, active: true };
}

function closeSidebarPanel() {
  if (shell.classList.contains("panel-collapsed")) return;
  shell.classList.add("panel-collapsed");
  updatePanelToggle();
  window.setTimeout(resizeCanvas, 240);
}

function prepareUIForTrafficAlert() {
  if (preparingTrafficAlertUI) return;
  preparingTrafficAlertUI = true;

  try {
    const shouldReturnToArc = weatherMode || returnToArcAfterThreat || returnToArcAfterManualThreat;
    returnToArcAfterThreat = shouldReturnToArc;
    manualThreatFocusKey = "";
    returnToArcAfterManualThreat = false;

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    closeSettings();
    closeTracking();
    closeLegend();
    closeAircraftDetails();
    closeAirportSearchModal();
    closeSidebarPanel();

    window.webkit?.messageHandlers?.scratchpad?.postMessage({ type: "dismissForTrafficAlert" });

    if (weatherMode) {
      setWeatherMode(false);
      setOrientationMode("track", { persist: false });
    }
  } finally {
    preparingTrafficAlertUI = false;
  }
}

function trafficTrackIdentifier(plane) {
  const nNumber = trackedAircraftKeyValue(plane);
  if (nNumber) return nNumber;

  const callsign = String(plane?.callsign || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return callsign && !["UNKNOWN", "TISBOTHER", "TISB"].includes(callsign) ? callsign : "";
}

function showTrafficTarget(key) {
  const plane = displayAircraft().find((candidate) => aircraftKey(candidate) === key);
  if (!plane) return;
  scheduleAircraftHighlight(key, { delayMs: 0, durationMs: 9000 });
  zoomToAircraftIfNeeded(plane);
  closeSidebarPanel();
  scheduleRender();
}

function trackTrafficTarget(key) {
  const plane = displayAircraft().find((candidate) => aircraftKey(candidate) === key);
  const nNumber = trafficTrackIdentifier(plane);
  if (!plane || !nNumber) return false;

  if (!trackedAircraft || trackedAircraft.nNumber !== nNumber) {
    preserveTrackedAircraftHistory(trackedAircraft);
  }
  trackedAircraft = {
    nNumber,
    criterion: trackingCriterionSelect?.value === "time" ? "time" : "distance",
    value: Number(trackingValueInput?.value) > 0 ? Number(trackingValueInput.value) : 10,
    isolate: Boolean(trackingIsolateToggle?.checked),
    alerted: false
  };
  saveTrackedAircraft();
  updateTrackingControls();
  scheduleAircraftHighlight(key, { delayMs: 0, durationMs: 9000 });
  zoomToAircraftIfNeeded(plane);
  closeSidebarPanel();
  renderList();
  scheduleRender();
  return true;
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

function applyCompassHeading(rawHeading, { accuracy = null, source = "browser" } = {}) {
  const nextHeading = normalizedDegrees(rawHeading);
  const now = performance.now();
  const headingAccuracy = Number(accuracy);
  const nativeHeading = source === "native";
  const poorAccuracyLimit = nativeHeading ? 65 : 55;
  if (Number.isFinite(headingAccuracy) && headingAccuracy > poorAccuracyLimit && compassHeadingDegrees !== null) return;

  if (!Number.isFinite(compassHeadingDegrees)) {
    compassHeadingDegrees = nextHeading;
    lastCompassHeadingAt = now;
    return;
  }

  const elapsedSeconds = lastCompassHeadingAt ? Math.max(0.016, (now - lastCompassHeadingAt) / 1000) : 0.25;
  const delta = signedDegreesDelta(compassHeadingDegrees, nextHeading);
  const stationary = gpsSpeedKts < 3 && (!gpsWatchId || gpsActive);
  const deadband = nativeHeading ? (stationary ? 0.8 : 0.35) : stationary ? 3.5 : 1.5;
  if (Math.abs(delta) < deadband) return;

  // Android browser compass data can chatter while the phone is sitting flat.
  // Rate limiting keeps track-up readable without disabling deliberate turns.
  const maxRate = nativeHeading ? (stationary ? 540 : 720) : stationary ? 90 : 180;
  const maxStep = maxRate * elapsedSeconds;
  const limitedDelta = Math.max(-maxStep, Math.min(maxStep, delta));
  const smoothing = nativeHeading ? (stationary ? 0.82 : 0.92) : stationary ? 0.42 : 0.62;
  compassHeadingDegrees = normalizedDegrees(compassHeadingDegrees + limitedDelta * smoothing);
  lastCompassHeadingAt = now;
}

function handleDeviceOrientation(event) {
  const webkitHeading = Number(event.webkitCompassHeading);
  if (Number.isFinite(webkitHeading)) {
    applyCompassHeading(webkitHeading, { accuracy: event.webkitCompassAccuracy });
    return;
  }

  const alpha = Number(event.alpha);
  const hasAbsoluteHeading = event.absolute === true || event.type === "deviceorientationabsolute";
  if (Number.isFinite(alpha) && hasAbsoluteHeading) {
    applyCompassHeading(360 - alpha);
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
  if (compassPermissionRequested) return;

  const requestCompass = () => {
    if (orientationMode === "track") enableCompassHeading();
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
  weatherImageRetryAt = 0;
}

function resetWeatherImageIfMoved(previousCenter, nextCenter, thresholdMiles = Math.min(8, Math.max(1.5, radiusMiles * 0.2))) {
  if (!previousCenter || !nextCenter) {
    resetWeatherImage();
    return;
  }
  if (milesBetween(previousCenter.lat, previousCenter.lon, nextCenter.lat, nextCenter.lon) > thresholdMiles) {
    resetWeatherImage();
  }
}

function randomJitter(minMs = 500, maxMs = 2000) {
  return minMs + Math.random() * (maxMs - minMs);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scheduleNextTrafficFetch({ failed = false, source = lastDataSource, stale = false } = {}) {
  if (failed) {
    trafficBackoffMs = trafficBackoffMs ? Math.min(60000, trafficBackoffMs * 2) : 5000;
    nextTrafficFetchAt = Date.now() + trafficBackoffMs + randomJitter(750, 3000);
    return;
  }

  trafficBackoffMs = 0;
  const sourceText = String(source || "").toLowerCase();
  const localWifi = sourceText.includes("wifi") || (sourceText.includes("ads-b") && isLocalNetworkUrl(adsbProxyBaseUrl));
  const internetSource =
    sourceText.includes("internet") ||
    sourceText.includes("network") ||
    sourceText.includes("airplanes.live") ||
    sourceText.includes("adsb.lol") ||
    sourceText.includes("adsb.fi");
  const faaSource = sourceText.includes("faa tais") || sourceText.includes("faa-tais");
  const liveStratus = sourceText.includes("stratus") && !stale;
  const staleStratus = sourceText.includes("stratus") && stale;
  const liveLocalWifi = localWifi && !stale;
  const staleLocalWifi = localWifi && stale;
  const baseDelay = liveStratus
    ? 750
    : staleStratus
      ? 1400
      : liveLocalWifi
        ? 1200
        : staleLocalWifi
          ? 1800
          : faaSource
            ? internetTrafficPollMs
          : internetSource && !stale
            ? internetTrafficPollMs
            : internetSource && stale
              ? internetTrafficStalePollMs
              : 6500;
  const jitter =
    liveStratus || liveLocalWifi
      ? randomJitter(50, 180)
      : (internetSource || faaSource) && !stale
        ? randomJitter(100, 250)
        : staleStratus || staleLocalWifi || internetSource || faaSource
        ? randomJitter(100, 400)
        : randomJitter(500, 2500);
  nextTrafficFetchAt = Date.now() + baseDelay + jitter;
}

function formatCounter(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : "--";
}

function formatHeadingValue(value) {
  const heading = Number(value);
  return Number.isFinite(heading) ? String(Math.round(normalizedDegrees(heading))).padStart(3, "0") : "--";
}

function isLocalNetworkHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLocalNetworkUrl(url) {
  try {
    return isLocalNetworkHost(new URL(url, window.location.href).hostname);
  } catch {
    return false;
  }
}

function internetTrafficSourceLabel() {
  return "Internet ADS-B";
}

function classifyTrafficSource(data = {}) {
  const source = String(data.displaySource || data.source || "").toLowerCase();
  if (source.includes("stratus")) return { type: "stratus", label: "STRATUS" };
  if (source.includes("faa tais") || source.includes("faa-tais") || source.includes("faa traffic")) {
    return { type: "faa", label: "FAA TAIS" };
  }
  if (
    source.includes("internet") ||
    source.includes("network") ||
    source.includes("airplanes.live") ||
    source.includes("adsb.lol") ||
    source.includes("adsb.fi")
  ) {
    return { type: "internet", label: "INTERNET ADS-B" };
  }
  if (source.includes("wifi")) return { type: "wifi", label: "WIFI ADS-B" };
  if (source.includes("cellular")) return { type: "cellular", label: "CELLULAR" };
  if (isLocalNetworkUrl(adsbProxyBaseUrl)) return { type: "wifi", label: "WIFI ADS-B" };
  return { type: "internet", label: "INTERNET ADS-B" };
}

function selectTrafficSourceDiagnostics({ source = "none", reason = "" } = {}) {
  trafficPipelineDiagnostics.selectedTrafficSource = source;
  trafficPipelineDiagnostics.selectedTrafficSourceReason = reason;
  if (trafficDebugEnabled) {
    console.info("Traffic source arbitration", {
      selectedSource: trafficPipelineDiagnostics.selectedTrafficSource,
      reason: trafficPipelineDiagnostics.selectedTrafficSourceReason,
      stratusActive: trafficPipelineDiagnostics.lastStratusActive,
      stratusPacketAgeSeconds: trafficPipelineDiagnostics.lastStratusPacketAgeSeconds,
      internetPollingActive: trafficPipelineDiagnostics.lastInternetPollingActive,
      internetLastRequestAgeSeconds: trafficPipelineDiagnostics.internetLastRequestStartedAt
        ? ((Date.now() - trafficPipelineDiagnostics.internetLastRequestStartedAt) / 1000).toFixed(1)
        : "--",
      internetHttpStatus: trafficPipelineDiagnostics.internetLastHttpStatus,
      internetTargetCount: trafficPipelineDiagnostics.internetLastTargetCount,
      internetDataAgeSeconds: trafficPipelineDiagnostics.internetLastDataAgeSeconds,
      internetNextRefreshEligibleSeconds: trafficPipelineDiagnostics.internetLastNextRefreshEligibleSeconds,
      internetError: trafficPipelineDiagnostics.internetLastError
    });
  }
}

function updateDataSourceIndicator(data = null) {
  if (!dataSourceIndicator || !dataSourceLabel) return;

  const source = data
    ? classifyTrafficSource(data)
    : {
        type: "offline",
        label: "NO TRAFFIC DATA"
      };
  const stale = Boolean(data?.stale);
  const receiverState = String(data?.receiverState || "").toLowerCase();
  const label =
    source.type === "stratus" && receiverState === "degraded"
      ? "STRATUS DEGRADED"
      : stale && source.type === "stratus"
      ? "STRATUS STALE"
      : stale
        ? `${source.label} STALE`
        : source.label;
  const stateKey = `${source.type}:${label}:${receiverState || (stale ? "stale" : "live")}:${data ? "data" : "none"}`;
  if (dataSourceIndicator.dataset.stateKey === stateKey) return;
  if (source.type === "stratus" && stateKey !== lastStratusReceiverState) {
    console.info("Stratus receiver state", {
      label,
      receiverState,
      stale,
      ageSeconds: data?.ageSeconds,
      lastUdpReceiveAgeSeconds: data?.lastUdpReceiveAgeSeconds,
      lastDecodedFrameAgeSeconds: data?.lastDecodedFrameAgeSeconds,
      lastTrafficReportAgeSeconds: data?.lastTrafficReportAgeSeconds,
      lastOwnshipReportAgeSeconds: data?.lastOwnshipReportAgeSeconds,
      packetsPerSecond: data?.packetsPerSecond,
      framesPerSecond: data?.framesPerSecond,
      trafficFramesPerSecond: data?.trafficFramesPerSecond,
      trafficPipelineDiagnostics: {
        lastRangeChangeSecondsAgo: trafficPipelineDiagnostics.lastRangeChangeAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastRangeChangeAt) / 1000).toFixed(1)
          : "--",
        lastRangeChangeValue: trafficPipelineDiagnostics.lastRangeChangeValue,
        lastNativeRequestSecondsAgo: trafficPipelineDiagnostics.lastNativeRequestAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastNativeRequestAt) / 1000).toFixed(1)
          : "--",
        lastNativeWebResponseSecondsAgo: trafficPipelineDiagnostics.lastNativeWebResponseAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastNativeWebResponseAt) / 1000).toFixed(1)
          : "--",
        lastJsTrafficStateUpdateSecondsAgo: trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt) / 1000).toFixed(1)
          : "--",
        lastRadarTrafficRenderSecondsAgo: trafficPipelineDiagnostics.lastRadarTrafficRenderAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastRadarTrafficRenderAt) / 1000).toFixed(1)
          : "--",
        renderTimerAliveSecondsAgo: trafficPipelineDiagnostics.lastRenderTimerAliveAt
          ? ((Date.now() - trafficPipelineDiagnostics.lastRenderTimerAliveAt) / 1000).toFixed(1)
          : "--"
      },
      staleReason: data?.staleReason || data?.warning
    });
    lastStratusReceiverState = stateKey;
  }
  dataSourceIndicator.dataset.stateKey = stateKey;

  dataSourceIndicator.hidden = false;
  dataSourceIndicator.classList.toggle("stratus", source.type === "stratus");
  dataSourceIndicator.classList.toggle("wifi", source.type === "wifi");
  dataSourceIndicator.classList.toggle("cellular", source.type === "cellular");
  dataSourceIndicator.classList.toggle("internet", source.type === "internet");
  dataSourceIndicator.classList.toggle("faa", source.type === "faa");
  dataSourceIndicator.classList.toggle("offline", source.type === "offline" || !data);
  dataSourceIndicator.classList.toggle("stale", stale || receiverState === "degraded");
  dataSourceIndicator.classList.toggle(
    "steady",
    source.type === "cellular" || source.type === "internet" || source.type === "faa" || source.type === "offline" || stale || receiverState === "degraded"
  );
  dataSourceLabel.textContent = label;
}

function logTrafficPipelineDiagnostics(data, reason = "sample") {
  const source = classifyTrafficSource(data);
  if (source.type !== "stratus" && source.type !== "internet" && source.type !== "faa") return;

  const now = Date.now();
  if (source.type === "internet" || source.type === "faa") {
    if (reason === "sample" && now - lastTrafficPipelineDebugAt < 15000) return;
    if (reason === "sample") lastTrafficPipelineDebugAt = now;
    console.info(source.type === "faa" ? "FAA TAIS traffic pipeline diagnostics" : "Internet ADS-B traffic pipeline diagnostics", {
      reason,
      provider: data?.providerSource || data?.source || trafficPipelineDiagnostics.internetLastProvider || "unknown",
      sourceUrl: trafficPipelineDiagnostics.internetLastSourceUrl,
      stale: Boolean(data?.stale),
      aircraft: aircraft.length,
      targetCount: trafficPipelineDiagnostics.internetLastTargetCount,
      httpStatus: trafficPipelineDiagnostics.internetLastHttpStatus,
      requestsPerMinute: Number((diagnosticRate(trafficPipelineDiagnostics.internetRequestTimestamps) * 60).toFixed(1)),
      successesPerMinute: Number((diagnosticRate(trafficPipelineDiagnostics.internetSuccessTimestamps) * 60).toFixed(1)),
      lastRequestStartedSecondsAgo: trafficPipelineDiagnostics.internetLastRequestStartedAt
        ? ((now - trafficPipelineDiagnostics.internetLastRequestStartedAt) / 1000).toFixed(1)
        : "--",
      lastRequestCompletedSecondsAgo: trafficPipelineDiagnostics.internetLastRequestCompletedAt
        ? ((now - trafficPipelineDiagnostics.internetLastRequestCompletedAt) / 1000).toFixed(1)
        : "--",
      lastSuccessAgeSeconds: trafficPipelineDiagnostics.internetLastSuccessAt
        ? ((now - trafficPipelineDiagnostics.internetLastSuccessAt) / 1000).toFixed(1)
        : "--",
      requestDurationMs: trafficPipelineDiagnostics.internetLastRequestDurationMs,
      lastStoreMutationSecondsAgo: trafficPipelineDiagnostics.internetLastStoreMutationAt
        ? ((now - trafficPipelineDiagnostics.internetLastStoreMutationAt) / 1000).toFixed(1)
        : "--",
      jsTrafficStateUpdateSecondsAgo: trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt
        ? ((now - trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt) / 1000).toFixed(1)
        : "--",
      sweepCount: trafficPipelineDiagnostics.sweepCount,
      sweepPeriodSeconds: trafficPipelineDiagnostics.sweepPeriodSeconds,
      freshTargetsThisSweep: trafficPipelineDiagnostics.freshTargetsThisSweep,
      predictedTargetsThisSweep: trafficPipelineDiagnostics.predictedTargetsThisSweep,
      fadingTargetsThisSweep: trafficPipelineDiagnostics.fadingTargetsThisSweep,
      removedTargetsThisSweep: trafficPipelineDiagnostics.removedTargetsThisSweep,
      debugTargetState: trafficPipelineDiagnostics.debugTargetState,
      selectedTargetSourceObservationAgeSeconds: Number.isFinite(Number(trafficPipelineDiagnostics.debugTargetState?.confirmedTimestamp))
        ? ((now - Number(trafficPipelineDiagnostics.debugTargetState.confirmedTimestamp)) / 1000).toFixed(1)
        : "--",
      recentPredictionCorrections: trafficPipelineDiagnostics.predictionCorrections.slice(-10),
      nextTrafficFetchSeconds: ((nextTrafficFetchAt - now) / 1000).toFixed(2),
      lastRangeChangeSecondsAgo: trafficPipelineDiagnostics.lastRangeChangeAt
        ? ((now - trafficPipelineDiagnostics.lastRangeChangeAt) / 1000).toFixed(1)
        : "--",
      workerCacheAgeSeconds: data?.ageSeconds ?? "--",
      workerCacheTtlSeconds: data?.cacheTtlSeconds ?? "--",
      workerDataAgeSeconds: data?.dataAgeSeconds ?? trafficPipelineDiagnostics.internetLastDataAgeSeconds ?? "--",
      nextRefreshEligibleInSeconds: data?.nextRefreshEligibleInSeconds ?? trafficPipelineDiagnostics.internetLastNextRefreshEligibleSeconds ?? "--",
      selectedSource: trafficPipelineDiagnostics.selectedTrafficSource,
      selectedSourceReason: trafficPipelineDiagnostics.selectedTrafficSourceReason,
      upstreamWarning: data?.warning || data?.upstreamFailures || "",
      taisGatewayConnected: data?.tais?.state === "live",
      taisLastMessageAgeSeconds: data?.tais?.lastMessageAgeSeconds ?? data?.gateway?.lastMessageAgeSeconds ?? "--",
      taisMessagesPerSecond: data?.tais?.messagesPerSecond ?? data?.gateway?.messagesPerSecond ?? "--",
      taisActiveTracks: data?.tais?.activeTracks ?? data?.gateway?.activeTracks ?? "--",
      taisFallbackReason: data?.tais?.fallbackReason || ""
    });
    return;
  }

  const receiverState = String(data?.receiverState || "").toLowerCase();
  const stateKey = `${reason}:${receiverState}:${data?.packetCount}:${data?.frameCount}:${data?.trafficFrameCount}:${aircraft.length}`;
  if (reason === "sample" && now - lastTrafficPipelineDebugAt < 30000) return;
  if (reason !== "sample" && trafficPipelineDiagnostics.lastStaleLogKey === stateKey) return;

  if (reason === "sample") lastTrafficPipelineDebugAt = now;
  trafficPipelineDiagnostics.lastStaleLogKey = stateKey;
  console.info("Stratus traffic pipeline diagnostics", {
    reason,
    receiverState,
    stale: Boolean(data?.stale),
    aircraft: aircraft.length,
    packetCount: data?.packetCount,
    frameCount: data?.frameCount,
    trafficFrameCount: data?.trafficFrameCount,
    ownshipFrameCount: data?.ownshipFrameCount,
    packetsPerSecond: data?.packetsPerSecond,
    framesPerSecond: data?.framesPerSecond,
    trafficFramesPerSecond: data?.trafficFramesPerSecond,
    lastUdpReceiveAgeSeconds: data?.lastUdpReceiveAgeSeconds,
    lastDecodedFrameAgeSeconds: data?.lastDecodedFrameAgeSeconds,
    lastTrafficReportAgeSeconds: data?.lastTrafficReportAgeSeconds,
    lastNativeRequestSecondsAgo: trafficPipelineDiagnostics.lastNativeRequestAt
      ? ((now - trafficPipelineDiagnostics.lastNativeRequestAt) / 1000).toFixed(1)
      : "--",
    lastNativeWebResponseSecondsAgo: trafficPipelineDiagnostics.lastNativeWebResponseAt
      ? ((now - trafficPipelineDiagnostics.lastNativeWebResponseAt) / 1000).toFixed(1)
      : "--",
    lastJsTrafficStateUpdateSecondsAgo: trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt
      ? ((now - trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt) / 1000).toFixed(1)
      : "--",
    lastRadarTrafficRenderSecondsAgo: trafficPipelineDiagnostics.lastRadarTrafficRenderAt
      ? ((now - trafficPipelineDiagnostics.lastRadarTrafficRenderAt) / 1000).toFixed(1)
      : "--",
    renderedContacts: trafficPipelineDiagnostics.lastTrafficRenderCount,
    sweepCount: trafficPipelineDiagnostics.sweepCount,
    sweepPeriodSeconds: trafficPipelineDiagnostics.sweepPeriodSeconds,
    freshTargetsThisSweep: trafficPipelineDiagnostics.freshTargetsThisSweep,
    fadingTargetsThisSweep: trafficPipelineDiagnostics.fadingTargetsThisSweep,
    removedTargetsThisSweep: trafficPipelineDiagnostics.removedTargetsThisSweep,
    debugTargetState: trafficPipelineDiagnostics.debugTargetState,
    renderTimerAliveSecondsAgo: trafficPipelineDiagnostics.lastRenderTimerAliveAt
      ? ((now - trafficPipelineDiagnostics.lastRenderTimerAliveAt) / 1000).toFixed(1)
      : "--",
    nextTrafficFetchSeconds: ((nextTrafficFetchAt - now) / 1000).toFixed(2),
    lastRangeChangeSecondsAgo: trafficPipelineDiagnostics.lastRangeChangeAt
      ? ((now - trafficPipelineDiagnostics.lastRangeChangeAt) / 1000).toFixed(1)
      : "--",
    staleReason: data?.staleReason || data?.warning || ""
  });
}

function pushDiagnosticTimestamp(bucket, timestamp = Date.now()) {
  bucket.push(timestamp);
  const cutoff = timestamp - 10000;
  while (bucket.length && bucket[0] < cutoff) bucket.shift();
}

function diagnosticRate(bucket) {
  return bucket.length ? bucket.length / 10 : 0;
}

function formatDiagnosticAge(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.max(0, number).toFixed(1)}s` : "--";
}

function updateTrafficDebugOverlay(data = null) {
  if (!stratusDiagnosticsEl) return;
  if (!trafficDebugEnabled) {
    stratusDiagnosticsEl.hidden = true;
    stratusDiagnosticsEl.innerHTML = "";
    return;
  }

  const now = Date.now();
  const bridgeAge = trafficPipelineDiagnostics.lastNativeWebResponseAt
    ? (now - trafficPipelineDiagnostics.lastNativeWebResponseAt) / 1000
    : null;
  const jsAge = trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt
    ? (now - trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt) / 1000
    : null;
  const renderAge = trafficPipelineDiagnostics.lastRadarTrafficRenderAt
    ? (now - trafficPipelineDiagnostics.lastRadarTrafficRenderAt) / 1000
    : null;
  const payloadRate = diagnosticRate(trafficPipelineDiagnostics.jsPayloadTimestamps);
  const internetRequestAge = trafficPipelineDiagnostics.internetLastRequestStartedAt
    ? (now - trafficPipelineDiagnostics.internetLastRequestStartedAt) / 1000
    : null;
  const internetSuccessAge = trafficPipelineDiagnostics.internetLastSuccessAt
    ? (now - trafficPipelineDiagnostics.internetLastSuccessAt) / 1000
    : null;
  const internetRequestRate = diagnosticRate(trafficPipelineDiagnostics.internetRequestTimestamps) * 60;
  const internetSuccessRate = diagnosticRate(trafficPipelineDiagnostics.internetSuccessTimestamps) * 60;
  const state = String(data?.receiverState || trafficPipelineDiagnostics.lastBridgeState || "waiting").toUpperCase();
  const target = trafficPipelineDiagnostics.debugTargetState;
  const confirmedAge = target?.confirmedTimestamp ? (now - Number(target.confirmedTimestamp)) / 1000 : null;
  const upstreamAge = trafficPipelineDiagnostics.internetLastUpstreamFetchedAt
    ? (now - Date.parse(trafficPipelineDiagnostics.internetLastUpstreamFetchedAt)) / 1000
    : null;
  const confirmedPosition = target?.confirmedPosition;
  const displayedPosition = target?.displayedPosition;

  stratusDiagnosticsEl.hidden = false;
  stratusDiagnosticsEl.innerHTML = `
    <span>UDP <strong>${formatDiagnosticAge(data?.lastUdpReceiveAgeSeconds)}</strong></span>
    <span>PKT/S <strong>${Number(data?.packetsPerSecond || 0).toFixed(1)}</strong></span>
    <span>FRAME <strong>${formatDiagnosticAge(data?.lastDecodedFrameAgeSeconds)}</strong></span>
    <span>FR/S <strong>${Number(data?.framesPerSecond || 0).toFixed(1)}</strong></span>
    <span>TRAFFIC <strong>${formatDiagnosticAge(data?.lastTrafficReportAgeSeconds)}</strong></span>
    <span>TR/S <strong>${Number(data?.trafficFramesPerSecond || 0).toFixed(1)}</strong></span>
    <span>SWEEP <strong>${trafficPipelineDiagnostics.sweepCount}</strong></span>
    <span>PERIOD <strong>${Number(trafficPipelineDiagnostics.sweepPeriodSeconds || sweepSeconds).toFixed(1)}s</strong></span>
    <span>FRESH <strong>${trafficPipelineDiagnostics.freshTargetsThisSweep}</strong></span>
    <span>FADE <strong>${trafficPipelineDiagnostics.fadingTargetsThisSweep}</strong></span>
    <span>BRIDGE <strong>${formatDiagnosticAge(bridgeAge)}</strong></span>
    <span>JS <strong>${formatDiagnosticAge(jsAge)}</strong></span>
    <span>PUSH/S <strong>${payloadRate.toFixed(1)}</strong></span>
    <span>NET REQ <strong>${formatDiagnosticAge(internetRequestAge)}</strong></span>
    <span>NET OK <strong>${formatDiagnosticAge(internetSuccessAge)}</strong></span>
    <span>NET/M <strong>${internetRequestRate.toFixed(1)}</strong></span>
    <span>OK/M <strong>${internetSuccessRate.toFixed(1)}</strong></span>
    <span>NET MS <strong>${Math.round(trafficPipelineDiagnostics.internetLastRequestDurationMs || 0)}</strong></span>
    <span>INTERNET HTTP <strong>${escapeHtml(String(trafficPipelineDiagnostics.internetLastHttpStatus || "--"))}</strong></span>
    <span>TARGETS <strong>${trafficPipelineDiagnostics.internetLastTargetCount ?? "--"}</strong></span>
    <span>DATA AGE <strong>${escapeHtml(String(trafficPipelineDiagnostics.internetLastDataAgeSeconds ?? "--"))}</strong></span>
    <span>NEXT REFRESH <strong>${escapeHtml(String(trafficPipelineDiagnostics.internetLastNextRefreshEligibleSeconds ?? "--"))}</strong></span>
    <span>PROV <strong>${escapeHtml(trafficPipelineDiagnostics.internetLastProvider || "--")}</strong></span>
    <span>CACHE <strong>${escapeHtml(trafficPipelineDiagnostics.internetLastCacheSource || target?.cacheSource || "--")}</strong></span>
    <span>SNAP <strong>${escapeHtml((trafficPipelineDiagnostics.internetLastSnapshotId || target?.receivedSnapshotId || "--").slice(0, 16))}</strong></span>
    <span>HASH <strong>${escapeHtml((trafficPipelineDiagnostics.internetLastSnapshotHash || "--").slice(0, 12))}</strong></span>
    <span>UP AGE <strong>${formatDiagnosticAge(upstreamAge)}</strong></span>
    <span>AC <strong>${escapeHtml(target?.callsign || target?.key || "--")}</strong></span>
    <span>SEQ <strong>${target?.positionSequence ?? "--"}</strong></span>
    <span>OBS AGE <strong>${formatDiagnosticAge(confirmedAge)}</strong></span>
    <span>DECISION <strong>${escapeHtml(target?.observationDecision || "--")}</strong></span>
    <span>POS <strong>${escapeHtml(
      confirmedPosition
        ? `${Number(confirmedPosition.lat).toFixed(5)},${Number(confirmedPosition.lon).toFixed(5)}`
        : "--"
    )}</strong></span>
    <span>DISPLAY POS <strong>${escapeHtml(
      displayedPosition
        ? `${Number(displayedPosition.lat).toFixed(5)},${Number(displayedPosition.lon).toFixed(5)}`
        : "--"
    )}</strong></span>
    <span>DISPLAY MODE <strong>${escapeHtml(target?.displayPositionSource || "--")}</strong></span>
    <span>PRED AGE <strong>${formatDiagnosticAge(target?.predictionAgeSeconds)}</strong></span>
    <span>RENDER <strong>${formatDiagnosticAge(renderAge)}</strong></span>
    <span>DISPLAY <strong>${aircraft.length}</strong></span>
    <span>ASP <strong>${trafficPipelineDiagnostics.airspaceFeatureCount}</strong></span>
    <span>DUP <strong>${trafficPipelineDiagnostics.airspaceDuplicateFeatureCount}</strong></span>
    <span>ASP LAYOUT/M <strong>${trafficPipelineDiagnostics.airspaceLabelLayoutRecalculationsPerMinute}</strong></span>
    <span>ASP DRAW/M <strong>${trafficPipelineDiagnostics.airspaceRedrawsPerMinute}</strong></span>
    <span>SRC <strong>${escapeHtml(trafficPipelineDiagnostics.selectedTrafficSource || "none")}</strong></span>
    <span>STATE <strong>${escapeHtml(state)}</strong></span>
  `;
}

function setStatusText(message) {
  if (!statusEl || message === lastStatusText) return;
  lastStatusText = message;
  statusEl.textContent = message;
}

function offlineDataNotice() {
  const localParts = [];
  if (offlineAirportDataActive) localParts.push("airports");
  if (offlineAirspaceDataActive) localParts.push("airspace");
  return localParts.length ? ` Local ${localParts.join(" and ")} active.` : "";
}

function activeTrackHeadingSource() {
  if (orientationMode !== "track") return "north";
  if (Number.isFinite(stratusTrackDegrees) && Date.now() - lastStratusOwnshipAt < 15000) return "stratus trk";
  if (Number.isFinite(stratusHeadingDegrees) && Date.now() - lastStratusHeadingAt < 15000) return "stratus hdg";
  if (Number.isFinite(gpsTrackDegrees) && gpsSpeedKts >= gpsTrackThresholdKts) return "iphone gps";
  if (Number.isFinite(compassHeadingDegrees)) return "iphone cmp";
  return "no hdg";
}

function updateStratusDiagnostics(data = null) {
  if (!stratusDiagnosticsEl) return;
  updateTrafficDebugOverlay(data);
}

function setOrientationMode(mode, { persist = true } = {}) {
  orientationMode = mode === "track" ? "track" : "north";
  if (orientationModeSelect) orientationModeSelect.value = orientationMode;
  if (persist) window.localStorage.setItem("ADSB_RADAR_ORIENTATION", orientationMode);
  if (orientationMode === "track") queueCompassHeadingEnable();
}

function ensureStratusTrackUp() {
  stratusAutoTrackUpEnabled = true;
  if (orientationMode !== "track") setOrientationMode("track", { persist: false });
}

function parseHeadingDegrees(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return normalizedDegrees(number);
  }
  return null;
}

function extractStratusHeading(data = {}) {
  const attitude = data.attitude || data.ahrs || {};
  return parseHeadingDegrees(
    data.heading,
    data.trueHeading,
    data.magneticHeading,
    data.compassHeading,
    data.trackHeading,
    attitude.heading,
    attitude.trueHeading,
    attitude.magneticHeading,
    attitude.compassHeading,
    attitude.yaw
  );
}

function applyStratusHeading(data = {}) {
  const heading = extractStratusHeading(data);
  if (!Number.isFinite(heading)) return;
  stratusHeadingDegrees = heading;
  lastStratusHeadingAt = Date.now();
}

function applyNativeDeviceHeading(data = {}) {
  const headingAge = Number(data.deviceHeadingAgeSeconds);
  const heading = parseHeadingDegrees(data.deviceHeading);
  if (!Number.isFinite(heading)) return;
  if (Number.isFinite(headingAge) && headingAge > 15) return;
  applyCompassHeading(heading, { accuracy: data.deviceHeadingAccuracy, source: "native" });
}

function updateDeviceThermalBadge(data = null) {
  if (!deviceThermalStatus) return;
  if (!data) {
    deviceThermalStatus.hidden = true;
    return;
  }

  latestDeviceStatus = data;
  const state = String(data.thermalState || "unknown").toLowerCase();
  const label = data.thermalLabel || state || "Unknown";
  deviceThermalStatus.hidden = false;
  deviceThermalStatus.classList.toggle("warm", state === "fair");
  deviceThermalStatus.classList.toggle("hot", state === "serious");
  deviceThermalStatus.classList.toggle("critical", state === "critical");
  deviceThermalStatus.textContent = `Device ${label}`;
  if ((state === "serious" || state === "critical") && performanceMode !== "cool") {
    setPerformanceMode("cool", { automatic: true });
  }
}

async function refreshDeviceThermalStatus() {
  if (!nativeStratusHandler) {
    updateDeviceThermalBadge(null);
    return null;
  }
  if (deviceStatusRefreshInFlight) return latestDeviceStatus;

  const requestId = `${Date.now()}-device-${++nativeStratusRequestId}`;
  deviceStatusRefreshInFlight = true;
  try {
    const payload = await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("adsb-native-stratus-response", handleResponse);
        reject(new Error("Native device status timed out"));
      }, 900);

      function handleResponse(event) {
        const detail = event.detail || {};
        if (detail.id !== requestId || detail.type !== "deviceStatus") return;
        window.clearTimeout(timeout);
        window.removeEventListener("adsb-native-stratus-response", handleResponse);
        if (detail.error) reject(new Error(detail.error));
        else resolve(detail.payload || {});
      }

      window.addEventListener("adsb-native-stratus-response", handleResponse);
      nativeStratusHandler.postMessage({ id: requestId, type: "deviceStatus" });
    });
    updateDeviceThermalBadge(payload);
    lastDeviceStatusRefreshAt = Date.now();
    deviceStatusRefreshInFlight = false;
    return payload;
  } catch {
    const fallback = { thermalState: "unknown", thermalLabel: "Unknown" };
    updateDeviceThermalBadge(fallback);
    lastDeviceStatusRefreshAt = Date.now();
    deviceStatusRefreshInFlight = false;
    return fallback;
  }
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
  if (proximityAlertAudioLevel <= 0) return;
  const now = performance.now();
  const distanceFactor = clamp(alert.distance / 3, 0, 1);
  const interval = alert.diverging
    ? clamp(760 + alert.distance * 820, 760, 1900)
    : clamp(170 + distanceFactor * 1050, 170, 1220);

  if (now - lastTrafficAlertSoundAt < interval) return;

  lastTrafficAlertSoundAt = now;
  const closeness = 1 - distanceFactor;
  const base = alert.diverging ? 430 : 500 + closeness * 190;
  const gain = (alert.diverging ? 0.08 : 0.1 + closeness * 0.05) * proximityAlertAudioLevel;
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
  stabilizeNativeViewport();
  const rect = canvas.getBoundingClientRect();
  pixelRatio = performanceModeConfig().pixelScale;
  canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function stabilizeNativeViewport() {
  if (!nativeStratusHandler) return;

  const viewport = window.visualViewport;
  const width = Math.max(window.innerWidth || 0, viewport?.width || 0, document.documentElement.clientWidth || 0);
  const height = Math.max(window.innerHeight || 0, viewport?.height || 0, document.documentElement.clientHeight || 0);
  if (width > 0) {
    document.documentElement.style.width = `${width}px`;
    document.body.style.width = `${width}px`;
    shell.style.width = `${width}px`;
  }
  if (height > 0) {
    document.documentElement.style.height = `${height}px`;
    document.body.style.height = `${height}px`;
    shell.style.height = `${height}px`;
  }
}

function currentRadarTheme() {
  return lightTheme ? radarThemes.light : radarThemes.dark;
}

function setLightTheme(enabled) {
  lightTheme = Boolean(enabled);
  window.localStorage.setItem("ADSB_RADAR_THEME", lightTheme ? "light" : "dark");
  document.body.classList.toggle("light-theme", lightTheme);
  shell.classList.toggle("light-theme", lightTheme);
  if (themeToggle) {
    themeToggle.classList.toggle("active", lightTheme);
    themeToggle.textContent = lightTheme ? "NITE" : "DAY";
    themeToggle.setAttribute("aria-pressed", String(lightTheme));
    themeToggle.setAttribute("aria-label", lightTheme ? "Use dark cockpit theme" : "Use light cockpit theme");
  }
  window.requestAnimationFrame(drawQuickNotes);
}

function thermalLabel() {
  if (!nativeStratusHandler) return "browser";
  return latestDeviceStatus?.thermalLabel || "--";
}

function performanceModeConfig(mode = performanceMode) {
  switch (mode) {
    case "cool":
      return { label: "cool down", fps: 15, pixelScale: 1, tileLimit: 18, trailFactor: 0.55 };
    case "fast":
      return { label: "fast", fps: 60, pixelScale: window.devicePixelRatio || 1, tileLimit: 64, trailFactor: 1 };
    case "reduced":
    default:
      return {
        label: "reduced load",
        fps: 24,
        pixelScale: Math.min(window.devicePixelRatio || 1, 1.5),
        tileLimit: 28,
        trailFactor: 0.75
      };
  }
}

function updatePerformanceTelemetry() {
  if (!performanceTelemetry) return;

  const config = performanceModeConfig();
  const lowPower = latestDeviceStatus?.lowPowerMode ? " low power" : "";
  performanceTelemetry.innerHTML = `
    <span><b>Load</b> ${config.label}${lowPower}</span>
    <span><b>FPS</b> ${Math.round(renderStats.fps) || "--"} / ${config.fps}</span>
    <span><b>Frame</b> ${renderStats.averageRenderMs ? renderStats.averageRenderMs.toFixed(1) : "--"}ms</span>
    <span><b>Slow</b> ${renderStats.slowPercent ? `${Math.round(renderStats.slowPercent)}%` : "0%"}</span>
    <span><b>Thermal</b> ${escapeHtml(thermalLabel())}</span>
    <span><b>Pixels</b> ${pixelRatio.toFixed(2)}x</span>
  `;
}

function setPerformanceMode(mode, { automatic = false, persist = true } = {}) {
  performanceMode = ["cool", "reduced", "fast"].includes(mode) ? mode : "reduced";
  reducedLoad = performanceMode !== "fast";
  if (persist && !automatic) {
    window.localStorage.setItem(performanceModeStorageKey, performanceMode);
    window.localStorage.setItem(performanceModeSelectionKey, "true");
    window.localStorage.setItem("ADSB_RADAR_REDUCED_LOAD", reducedLoad ? "true" : "false");
  }
  document.body.classList.toggle("reduced-load", reducedLoad);
  shell.classList.toggle("reduced-load", reducedLoad);
  document.body.classList.toggle("cool-load", performanceMode === "cool");
  shell.classList.toggle("cool-load", performanceMode === "cool");
  document.body.classList.toggle("fast-load", performanceMode === "fast");
  shell.classList.toggle("fast-load", performanceMode === "fast");
  if (performanceModeSelect) performanceModeSelect.value = performanceMode;
  if (automatic && performanceTelemetry) {
    performanceTelemetry.dataset.notice = "Cool Down enabled after iOS reported high thermal pressure.";
  } else if (performanceTelemetry) {
    delete performanceTelemetry.dataset.notice;
  }
  lastRenderedAt = 0;
  lastWeatherEnsureAt = 0;
  resizeCanvas();
  updatePerformanceTelemetry();
  scheduleRender();
}

function recordRenderStats(frameStartedAt, frameTimestamp) {
  const renderMs = performance.now() - frameStartedAt;
  const targetMs = 1000 / performanceModeConfig().fps;
  const frameGap = renderStats.lastFrameAt ? frameTimestamp - renderStats.lastFrameAt : targetMs;

  renderStats.frames += 1;
  renderStats.totalRenderMs += renderMs;
  if (renderMs > targetMs * 0.85 || frameGap > targetMs * 1.65) renderStats.slowFrames += 1;
  renderStats.lastFrameAt = frameTimestamp;

  if (!renderStats.lastReportAt) renderStats.lastReportAt = frameTimestamp;
  const elapsed = frameTimestamp - renderStats.lastReportAt;
  if (elapsed < 1000) return;

  renderStats.fps = (renderStats.frames * 1000) / elapsed;
  renderStats.averageRenderMs = renderStats.totalRenderMs / Math.max(1, renderStats.frames);
  renderStats.slowPercent = (renderStats.slowFrames / Math.max(1, renderStats.frames)) * 100;
  renderStats.frames = 0;
  renderStats.slowFrames = 0;
  renderStats.totalRenderMs = 0;
  renderStats.lastReportAt = frameTimestamp;
  updatePerformanceTelemetry();
}

function maybeRefreshDeviceStatus() {
  if (!nativeStratusHandler) return;
  const now = Date.now();
  if (now - lastDeviceStatusRefreshAt < 15000) return;
  refreshDeviceThermalStatus();
}

function updatePanelToggle() {
  const collapsed = shell.classList.contains("panel-collapsed");
  shell.classList.toggle("portrait-menu-open", isPortraitLayout() && !collapsed);
  panelToggle.setAttribute("aria-label", collapsed ? "Show panel" : "Hide panel");
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  if (!collapsed) renderList({ force: true });
  updateProximityAlert();
  updateBottomRangeButton();
}

function isPortraitLayout() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  return height > width;
}

function applyResponsivePanelMode({ initial = false } = {}) {
  const portrait = isPortraitLayout();
  shell.classList.toggle("portrait-layout", portrait);
  if (portrait && initial) {
    shell.classList.add("panel-collapsed");
  }
  if (!portrait) {
    shell.classList.remove("portrait-menu-open");
  }
  updatePanelToggle();
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

function storageReadJson(key, fallback = null) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function storageWriteJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage may be unavailable or full; bundled seed data remains the fallback.
  }
}

async function fetchWithTimeout(url, { timeoutMs = 4000, ...options } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    timeoutMs: options.timeoutMs ?? 4000,
    cache: options.cache,
    headers: {
      accept: "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function fetchTextWithTimeout(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    timeoutMs: options.timeoutMs ?? 4000,
    cache: options.cache,
    headers: {
      accept: options.accept || "text/plain,*/*"
    }
  });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.text();
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

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !usefulTypes.has(type)) {
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

  const rawAircraftType = String(raw.rawAircraftType || raw.t || raw.type || "").trim();
  return {
    hex: String(raw.hex || raw.icao || "").trim(),
    icao: String(raw.icao || raw.hex || "").trim(),
    nNumber: String(raw.nNumber || raw.r || raw.reg || raw.registration || "").trim(),
    registration: String(raw.registration || raw.nNumber || raw.r || raw.reg || "").trim(),
    callsign: String(raw.callsign || raw.flight || raw.call || "").trim(),
    rawAircraftType,
    type: rawAircraftType,
    manufacturer: String(raw.manufacturer || "").trim(),
    model: String(raw.model || "").trim(),
    displayType: String(raw.displayType || "").trim(),
    aircraftCategory: String(raw.aircraftCategory || raw.category || "").trim(),
    registryYear: Number(raw.registryYear) || null,
    sourceType: String(raw.sourceType || raw.source || raw.messagesource || raw.mlat_source || "").trim(),
    lat,
    lon,
    altitude: raw.altitude ?? raw.alt_baro ?? raw.alt_geom ?? null,
    speed: raw.speed ?? raw.gs ?? raw.tas ?? raw.ias ?? null,
    track: raw.track ?? raw.true_heading ?? raw.nav_heading ?? null,
    verticalRate: raw.verticalRate ?? raw.baro_rate ?? raw.geom_rate ?? null,
    seen: raw.seen ?? null,
    seenPos: raw.seenPos ?? raw.seen_pos ?? null,
    positionObservedAt: raw.positionObservedAt ?? raw.updatedAt ?? raw.lastSeenAt ?? raw.timestamp ?? null,
    positionTimestampTrusted: raw.positionTimestampTrusted ?? null,
    positionTimestampSource: raw.positionTimestampSource || "",
    sourceMessageTimestamp: raw.sourceMessageTimestamp ?? null,
    sourcePositionAgeSeconds: raw.sourcePositionAgeSeconds ?? raw.seen_pos ?? null,
    workerRetrievedAt: raw.workerRetrievedAt ?? null,
    updatedAt: raw.updatedAt ?? raw.positionObservedAt ?? raw.lastSeenAt ?? raw.timestamp ?? null,
    upstreamSnapshotId: raw.upstreamSnapshotId || "",
    upstreamSnapshotHash: raw.upstreamSnapshotHash || "",
    faaTrackNumber: String(raw.faaTrackNumber || "").trim(),
    sourceFacility: String(raw.sourceFacility || "").trim(),
    beaconCode: String(raw.beaconCode || "").trim(),
    departure: String(raw.departure || "").trim(),
    destination: String(raw.destination || "").trim(),
    flightPlanCorrelated: Boolean(raw.flightPlanCorrelated),
    emergency: raw.emergency || null,
    category: raw.category || null
  };
}

function isTisbOtherAircraft(plane) {
  const fields = [plane.type, plane.category, plane.sourceType, plane.hex, plane.callsign]
    .map((value) => String(value || "").toLowerCase());
  return fields.some((value) => value.includes("tisb_other") || value.includes("tisb other"));
}

function hasUsefulAircraftIdentity(plane) {
  const callsign = String(plane.callsign || "").trim().toUpperCase();
  return Boolean(
    String(plane.nNumber || "").trim() ||
      (callsign && !["UNKNOWN", "TISB_OTHER", "TIS-B"].includes(callsign)) ||
      String(plane.type || "").trim()
  );
}

function isLikelyTisbDuplicate(candidate, target) {
  if (!isTisbOtherAircraft(candidate)) return false;
  if (!hasUsefulAircraftIdentity(target) || isTisbOtherAircraft(target)) return false;

  const distanceNm = milesToNauticalMiles(milesBetween(candidate.lat, candidate.lon, target.lat, target.lon));
  if (!Number.isFinite(distanceNm) || distanceNm > 0.12) return false;

  const candidateAltitude = Number(candidate.altitude);
  const targetAltitude = Number(target.altitude);
  if (Number.isFinite(candidateAltitude) && Number.isFinite(targetAltitude) && Math.abs(candidateAltitude - targetAltitude) > 300) {
    return false;
  }

  const candidateSpeed = Number(candidate.speed);
  const targetSpeed = Number(target.speed);
  if (Number.isFinite(candidateSpeed) && Number.isFinite(targetSpeed) && Math.abs(candidateSpeed - targetSpeed) > 45) {
    return false;
  }

  const candidateTrack = Number(candidate.track);
  const targetTrack = Number(target.track);
  if (Number.isFinite(candidateTrack) && Number.isFinite(targetTrack)) {
    const trackDelta = Math.abs(normalizedDegrees(candidateTrack - targetTrack + 180) - 180);
    if (trackDelta > 35) return false;
  }

  return true;
}

function dropDuplicateTisbOtherTargets(rows) {
  return rows.filter((candidate) => {
    if (!isTisbOtherAircraft(candidate)) return true;
    return !rows.some((target) => target !== candidate && isLikelyTisbDuplicate(candidate, target));
  });
}

function normalizeOwnship(raw) {
  const normalized = normalizeAircraft(raw || {});
  if (!normalized) return null;
  normalized.geoAltitude = raw.geoAltitude ?? raw.alt_geom ?? null;
  return normalized;
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

function signedDegreesDelta(from, to) {
  return ((normalizedDegrees(to) - normalizedDegrees(from) + 540) % 360) - 180;
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

function formatClosureRate(closureKts) {
  if (!Number.isFinite(closureKts)) return "Closure --";
  if (closureKts <= 0) return "Opening";
  return `Closure ${Math.round(closureKts / 20) * 20} kt`;
}

function isAlertDisplayDevice() {
  return true;
}

function isDesktopArcDisplay() {
  return weatherMode && window.matchMedia("(min-width: 1181px)").matches;
}

function arcHeadingOverrideActive(now = Date.now()) {
  return Number.isFinite(arcHeadingOverrideDegrees) && now < arcHeadingOverrideUntil;
}

function clearArcHeadingOverride() {
  arcHeadingOverrideDegrees = null;
  arcHeadingOverrideStartedAt = 0;
  arcHeadingOverrideUntil = 0;
  updateArcHeadingOverrideControl();
}

function setArcHeadingOverride(degrees) {
  if (!isDesktopArcDisplay()) return;
  const heading = normalizedDegrees(degrees);
  const now = Date.now();
  arcHeadingOverrideDegrees = heading;
  arcHeadingOverrideStartedAt = now;
  arcHeadingOverrideUntil = now + 10000;
  arcForwardHeadingDegrees = heading;
  lastArcForwardHeadingAt = performance.now();
  updateArcHeadingOverrideControl(now);
}

function updateArcHeadingOverrideControl(now = Date.now()) {
  if (!arcHeadingOverrideEl) return;
  const visible = isDesktopArcDisplay();
  arcHeadingOverrideEl.hidden = !visible;
  if (!visible) {
    arcHeadingOverrideEl.style.setProperty("--arc-heading-countdown", "0");
    for (const button of arcHeadingOverrideEl.querySelectorAll("button[data-heading]")) {
      button.classList.remove("active");
    }
    return;
  }

  const active = arcHeadingOverrideActive(now);
  if (!active && arcHeadingOverrideDegrees !== null) {
    arcHeadingOverrideDegrees = null;
    arcHeadingOverrideStartedAt = 0;
    arcHeadingOverrideUntil = 0;
  }

  const duration = arcHeadingOverrideUntil - arcHeadingOverrideStartedAt;
  const remaining = active && duration > 0 ? clamp((arcHeadingOverrideUntil - now) / duration, 0, 1) : 0;
  arcHeadingOverrideEl.style.setProperty("--arc-heading-countdown", remaining.toFixed(3));
  for (const button of arcHeadingOverrideEl.querySelectorAll("button[data-heading]")) {
    const buttonHeading = normalizedDegrees(Number(button.dataset.heading));
    button.classList.toggle("active", active && buttonHeading === arcHeadingOverrideDegrees);
  }
}

function closureRateKts(plane, currentDistance) {
  const targetSpeed = Number(plane.speed);
  const targetTrack = Number(plane.track);
  const ownSpeed = Number(gpsSpeedKts);
  const ownTrack = Number(gpsTrackDegrees);
  const bearing = bearingDegrees(center.lat, center.lon, plane.lat, plane.lon);

  if (Number.isFinite(targetSpeed) && Number.isFinite(targetTrack)) {
    const toRad = (value) => (value * Math.PI) / 180;
    const vector = (speed, track) => ({
      east: speed * Math.sin(toRad(track)),
      north: speed * Math.cos(toRad(track))
    });
    const targetVector = vector(targetSpeed, targetTrack);
    const ownVector =
      Number.isFinite(ownSpeed) && Number.isFinite(ownTrack) && ownSpeed >= 0.5
        ? vector(ownSpeed, ownTrack)
        : { east: 0, north: 0 };
    const lineOfSight = {
      east: Math.sin(toRad(bearing)),
      north: Math.cos(toRad(bearing))
    };
    const relativeEast = targetVector.east - ownVector.east;
    const relativeNorth = targetVector.north - ownVector.north;
    return -(relativeEast * lineOfSight.east + relativeNorth * lineOfSight.north);
  }

  const history = tracks.get(aircraftKey(plane)) || [];
  const now = Date.now();
  const recent = history
    .filter((sample) => Number.isFinite(sample.at) && now - sample.at <= 90000)
    .sort((a, b) => a.at - b.at);
  const reference = recent[0] || history[history.length - 2] || history[history.length - 1];
  if (!reference?.at) return 0;

  const seconds = Math.max(1, (now - reference.at) / 1000);
  const referenceDistance = milesBetween(center.lat, center.lon, reference.lat, reference.lon);
  const milesPerHour = ((referenceDistance - currentDistance) / seconds) * 3600;
  return milesPerHour * 0.868976;
}

function alertRangeForClosure(closureKts) {
  if (closureKts > 200) return 3;
  if (closureKts < 50) return 1;
  return 2;
}

function shouldPredictAircraft(plane) {
  const key = aircraftKey(plane);
  if (trafficAlertActive && proximityAlertKey && key === proximityAlertKey) return true;
  return isTrackedAircraft(plane);
}

function predictedAircraftForDisplay(plane, now = Date.now()) {
  if (!plane) return plane;
  const displayPlane = trafficTargetStates.get(aircraftKey(plane))?.displayPlane;
  return displayPlane ? { ...plane, ...displayPlane } : plane;
}

function altitudeBracketLabel() {
  return altitudeBracketFt ? `${altitudeBracketFt}'` : "ALL";
}

function updateAltitudeBracketButton() {
  if (!altitudeBracketButton) return;
  altitudeBracketButton.textContent = `VFR ${altitudeBracketLabel()}`;
  altitudeBracketButton.classList.toggle("active", Boolean(altitudeBracketFt));
  altitudeBracketButton.setAttribute(
    "aria-label",
    altitudeBracketFt
      ? `Vertical traffic alert filter ${altitudeBracketFt} feet`
      : "Vertical traffic alert filter all altitudes"
  );
}

function cycleAltitudeBracket() {
  altitudeBracketFt = altitudeBracketFt === 500 ? 1000 : altitudeBracketFt === 1000 ? null : 500;
  window.localStorage.setItem(altitudeBracketPreferenceKey, altitudeBracketFt === null ? "0" : String(altitudeBracketFt));
  updateAltitudeBracketButton();
  updateProximityAlert();
}

function altitudeBracketAllowsAlert(plane) {
  if (!altitudeBracketFt) return true;

  const ownAltitude = Number(gpsAltitudeFt);
  const targetAltitude = Number(plane.altitude);
  if (!Number.isFinite(ownAltitude) || !Number.isFinite(targetAltitude)) return true;

  const delta = targetAltitude - ownAltitude;
  if (Math.abs(delta) <= altitudeBracketFt) return true;

  const verticalRate = Number(plane.verticalRate);
  if (!Number.isFinite(verticalRate) || Math.abs(verticalRate) < 50) return false;

  const movingTowardBand = (delta > 0 && verticalRate < 0) || (delta < 0 && verticalRate > 0);
  if (!movingTowardBand) return false;

  const lookaheadSeconds = 90;
  const projectedDelta = delta + (verticalRate * lookaheadSeconds) / 60;
  return Math.abs(projectedDelta) <= altitudeBracketFt || Math.sign(projectedDelta) !== Math.sign(delta);
}

function proximityCandidate(plane) {
  if (isGroundTraffic(plane)) return null;
  if (!altitudeBracketAllowsAlert(plane)) return null;

  const displayPlane = predictedAircraftForDisplay(plane);
  const distance = milesBetween(center.lat, center.lon, displayPlane.lat, displayPlane.lon);
  const closureKts = closureRateKts(displayPlane, distance);
  const key = aircraftKey(plane);
  const diverging = closureKts <= 0;
  const alertRange = diverging && key === proximityAlertKey ? 3 : alertRangeForClosure(closureKts);
  if (distance > alertRange) return null;

  const bearing = bearingDegrees(center.lat, center.lon, displayPlane.lat, displayPlane.lon);
  return {
    plane: displayPlane,
    distance,
    closureKts,
    diverging,
    relativeBearing: relativeBearingDegrees(bearing)
  };
}

function clearProximityAlert() {
  proximityAlertEl.hidden = true;
  proximityAlertEl.textContent = "";
  proximityAlertEl.classList.remove("diverging", "manual-focus", "solid");
  proximityAlertKey = "";
  proximityAlertSolid = false;
  proximityAlertAudioLevel = 1;
  proximityDivergingSince = 0;
  trafficAlertActive = false;
  manualThreatFocusKey = "";
  if (returnToArcAfterThreat) {
    returnToArcAfterThreat = false;
    setWeatherMode(true);
  }
  if (returnToArcAfterManualThreat) {
    returnToArcAfterManualThreat = false;
    setWeatherMode(true);
  }
  updateBottomRangeButton();
}

function clearManualThreatFocus() {
  const shouldReturnToArc = returnToArcAfterManualThreat;
  manualThreatFocusKey = "";
  returnToArcAfterManualThreat = false;
  if (proximityAlertKey && !returnToArcAfterThreat) proximityAlertKey = "";
  proximityAlertSolid = false;
  proximityAlertAudioLevel = 1;
  proximityDivergingSince = 0;
  trafficAlertActive = false;
  proximityAlertEl.hidden = true;
  proximityAlertEl.textContent = "";
  proximityAlertEl.classList.remove("diverging", "manual-focus", "solid");
  if (shouldReturnToArc) setWeatherMode(true);
  updateBottomRangeButton();
  updateWxNearestTarget();
}

function clearActiveTrafficAlert() {
  if (manualThreatFocusKey) {
    clearManualThreatFocus();
    return;
  }

  if (proximityAlertKey) dismissedTrafficAlertKey = proximityAlertKey;
  const shouldReturnToArc = returnToArcAfterThreat;
  proximityAlertEl.hidden = true;
  proximityAlertEl.textContent = "";
  proximityAlertEl.classList.remove("diverging", "manual-focus", "solid");
  proximityAlertSolid = false;
  proximityAlertAudioLevel = 1;
  proximityDivergingSince = 0;
  trafficAlertActive = false;
  if (shouldReturnToArc) {
    returnToArcAfterThreat = false;
    setWeatherMode(true);
  }
  updateBottomRangeButton();
  updateWxNearestTarget();
}

function nearestVisibleAircraft() {
  const maxDistance = radiusMiles <= 15 ? closeRangeNearestTargetMiles : radiusMiles;
  return visibleAircraft()
    .map((plane) => ({
      plane,
      distance: milesBetween(center.lat, center.lon, plane.lat, plane.lon),
      bearing: bearingDegrees(center.lat, center.lon, plane.lat, plane.lon)
    }))
    .filter((target) => target.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0];
}

function updateWxNearestTarget() {
  if (!wxNearestTarget) return;

  if (!weatherMode) {
    wxNearestTarget.hidden = true;
    wxNearestTarget.innerHTML = "";
    wxNearestTarget.dataset.targetKey = "";
    wxNearestTargetKey = "";
    return;
  }

  if (trafficAlertActive && proximityAlertKey && !proximityAlertEl.hidden) {
    wxNearestTarget.hidden = true;
    return;
  }

  if (wxDisplayMode === "wxOnly") {
    wxNearestTarget.hidden = true;
    wxNearestTarget.innerHTML = "";
    wxNearestTarget.dataset.targetKey = "";
    wxNearestTargetKey = "";
    return;
  }

  const nearest = nearestVisibleAircraft();
  if (!nearest) {
    wxNearestTarget.innerHTML = `<span class="wx-nearest-label">Range to nearest target</span><strong class="wx-nearest-data">--</strong>`;
    wxNearestTarget.dataset.targetKey = "";
    wxNearestTargetKey = "";
    wxNearestTarget.hidden = false;
    return;
  }

  wxNearestTargetKey = aircraftKey(nearest.plane);
  wxNearestTarget.dataset.targetKey = wxNearestTargetKey;
  const relativeBearing = relativeBearingDegrees(nearest.bearing);
  wxNearestTarget.innerHTML = `
    <span class="wx-nearest-label">Range to nearest target</span>
    <strong class="wx-nearest-data">${formatRangeToTarget(nearest.distance)} ${clockDirection(relativeBearing)} O'Clock</strong>
    <span class="wx-nearest-altitude">${relativeAltitudeDetail(nearest.plane.altitude)}</span>
  `;
  wxNearestTarget.hidden = false;
}

function aircraftByKey(key) {
  if (!key) return null;
  return visibleAircraft().find((plane) => aircraftKey(plane) === key) || null;
}

function focusAircraftOnFullRadar(plane, { returnToArc = false } = {}) {
  if (!plane) return;
  const key = aircraftKey(plane);
  if (!key) return;
  const displayPlane = predictedAircraftForDisplay(plane);

  manualThreatFocusKey = key;
  proximityAlertKey = key;
  proximityAlertSolid = true;
  proximityAlertAudioLevel = 0;
  proximityHighlightLastAt = 0;
  trafficAlertActive = true;
  returnToArcAfterManualThreat = Boolean(returnToArc);

  radarBlips.set(key, { ...displayPlane, radarSeenAt: Date.now(), liveUpdatedAt: Date.now() });
  setWeatherMode(false);
  const distance = milesBetween(center.lat, center.lon, displayPlane.lat, displayPlane.lon);
  const nextRange = rangeForDistance(distance + 0.6);
  if (nextRange !== radiusMiles) {
    setRange(nextRange);
    fetchAirspace();
    fetchTraffic({ force: true });
  }
  scheduleAircraftHighlight(key, { delayMs: 0, durationMs: 12000 });
  updateBottomRangeButton();
  updateProximityAlert();
}

function focusNearestTargetFromArc() {
  if (!weatherMode) return;
  const targetKey = wxNearestTarget?.dataset.targetKey || wxNearestTargetKey;
  const targetPlane = aircraftByKey(targetKey);
  const nearest = targetPlane ? { plane: targetPlane } : nearestVisibleAircraft();
  if (!nearest?.plane) return;
  focusAircraftOnFullRadar(nearest.plane, { returnToArc: true });
}

function focusActiveAlertFromArc() {
  if (!isDesktopArcDisplay() || !trafficAlertActive || !proximityAlertKey) return false;
  const plane = aircraftByKey(proximityAlertKey);
  if (!plane) return false;
  focusAircraftOnFullRadar(plane, { returnToArc: false });
  return true;
}

function highlightProximityTarget(alert) {
  const key = aircraftKey(alert.plane);
  const now = Date.now();
  if (key !== proximityAlertKey) {
    proximityAlertKey = key;
    proximityAlertSolid = false;
    proximityAlertAudioLevel = 1;
    proximityHighlightLastAt = 0;
    proximityDivergingSince = 0;
  }

  if (!proximityHighlightLastAt || now - proximityHighlightLastAt > 8500) {
    scheduleAircraftHighlight(key, { delayMs: 0, durationMs: 10000 });
    proximityHighlightLastAt = now;
  }
}

function renderManualThreatFocus() {
  if (!manualThreatFocusKey) return false;
  const manualPlane = visibleAircraft().find((plane) => aircraftKey(plane) === manualThreatFocusKey);
  if (!manualPlane) return false;

  const displayPlane = predictedAircraftForDisplay(manualPlane);
  const distance = milesBetween(center.lat, center.lon, displayPlane.lat, displayPlane.lon);

  const closureKts = closureRateKts(displayPlane, distance);
  const isThreatFocus =
    closureKts > 0 &&
    !isGroundTraffic(displayPlane) &&
    altitudeBracketAllowsAlert(displayPlane) &&
    distance <= alertRangeForClosure(closureKts);
  trafficAlertActive = true;
  proximityAlertKey = manualThreatFocusKey;
  if (!proximityHighlightLastAt || Date.now() - proximityHighlightLastAt > 8500) {
    scheduleAircraftHighlight(manualThreatFocusKey, { delayMs: 0, durationMs: 10000 });
    proximityHighlightLastAt = Date.now();
  }
  proximityAlertEl.hidden = false;
  proximityAlertEl.classList.add("manual-focus", "solid");
  proximityAlertEl.classList.toggle("threat-focus", isThreatFocus);
  proximityAlertEl.classList.remove("diverging");
  proximityAlertEl.innerHTML = `
    <strong class="traffic-alert-main">
      Tracking nearest traffic
      <span class="traffic-alert-number">${formatRangeToTarget(distance)}</span>
      ${altitudeRelation(displayPlane.altitude)}
      <span class="traffic-alert-number">${formatAltitude(displayPlane.altitude)}</span>
      <span class="traffic-alert-closure">${formatClosureRate(closureKts)}</span>
    </strong>
    <button type="button" class="traffic-alert-clear" aria-label="Clear nearest traffic tracking">Clear</button>
  `;
  updateBottomRangeButton();
  updateWxNearestTarget();
  return true;
}

function updateProximityAlert() {
  if (!proximityAlertEl) return;
  if (preparingTrafficAlertUI) return;
  if (!gpsActive || !isAlertDisplayDevice()) {
    clearProximityAlert();
    return;
  }

  const alert = visibleAircraft()
    .map(proximityCandidate)
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!alert) {
    if (renderManualThreatFocus()) return;
    dismissedTrafficAlertKey = "";
    clearProximityAlert();
    return;
  }

  const alertKey = aircraftKey(alert.plane);
  if (dismissedTrafficAlertKey && dismissedTrafficAlertKey !== alertKey) {
    dismissedTrafficAlertKey = "";
  }
  if (alertKey === dismissedTrafficAlertKey) {
    proximityAlertEl.hidden = true;
    trafficAlertActive = false;
    updateBottomRangeButton();
    updateWxNearestTarget();
    return;
  }

  const isNewAlert = alertKey !== proximityAlertKey || !trafficAlertActive || Boolean(manualThreatFocusKey);
  if (isNewAlert) prepareUIForTrafficAlert();

  if (alertKey !== proximityAlertKey) {
    if (!isDesktopArcDisplay() && radiusMiles !== 5) {
      setRange(5);
      fetchAirspace();
      fetchTraffic({ force: true });
    }
  }
  trafficAlertActive = true;
  updateBottomRangeButton();
  radarBlips.set(alertKey, { ...alert.plane, radarSeenAt: Date.now(), liveUpdatedAt: Date.now() });
  highlightProximityTarget(alert);
  const now = Date.now();
  const closeInAlert = alert.distance <= 2 || Math.abs(alert.closureKts) < 35;
  if (alert.diverging) {
    if (!proximityDivergingSince) proximityDivergingSince = now;
  } else {
    proximityDivergingSince = 0;
  }
  const divergingStable = alert.diverging && now - proximityDivergingSince >= 3500;
  if (alert.diverging) {
    proximityAlertAudioLevel = 0;
    proximityAlertSolid = true;
    if (returnToArcAfterThreat && divergingStable) {
      returnToArcAfterThreat = false;
      setWeatherMode(true);
    }
  }
  playTrafficAlertPing(alert);
  const muteHint = proximityAlertAudioLevel === 0.5 ? `<span class="traffic-alert-mute">Tap to mute</span>` : "";
  proximityAlertEl.innerHTML = `
    <strong class="traffic-alert-main">
      Traffic
      <span class="traffic-alert-number">${clockDirection(alert.relativeBearing)}</span> O'Clock
      <span class="traffic-alert-number">${formatRangeToTarget(alert.distance)}</span>
      ${altitudeRelation(alert.plane.altitude)}
      <span class="traffic-alert-number">${formatAltitude(alert.plane.altitude)}</span>
      <span class="traffic-alert-closure">${formatClosureRate(alert.closureKts)}</span>
    </strong>
    ${muteHint}
    <button type="button" class="traffic-alert-clear" aria-label="Clear traffic alert">Clear</button>
  `;
  proximityAlertEl.classList.toggle("diverging", alert.diverging);
  proximityAlertEl.classList.toggle("solid", proximityAlertSolid || alert.diverging || closeInAlert);
  proximityAlertEl.classList.remove("manual-focus");
  proximityAlertEl.hidden = false;
  updateWxNearestTarget();
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
  if (orientationMode !== "track") return null;
  if (Number.isFinite(stratusTrackDegrees) && Date.now() - lastStratusOwnshipAt < 15000) return stratusTrackDegrees;
  if (Number.isFinite(stratusHeadingDegrees) && Date.now() - lastStratusHeadingAt < 15000) return stratusHeadingDegrees;
  if (Number.isFinite(gpsTrackDegrees) && gpsSpeedKts >= gpsTrackThresholdKts) return gpsTrackDegrees;
  if (Number.isFinite(compassHeadingDegrees)) return compassHeadingDegrees;
  return null;
}

function gpsModeSelected() {
  return airportSelect.value === "gps";
}

function radarRotationDegrees() {
  if (weatherMode && Number.isFinite(arcForwardHeadingDegrees)) return arcForwardHeadingDegrees;
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
  const desktopArc = window.matchMedia("(min-width: 1181px)").matches;
  const arcDropPx = window.matchMedia("(pointer: coarse)").matches ? 38 : 30;
  const cy = desktopArc
    ? Math.min(height - framePad - 160, Math.max(560, height * 0.7))
    : Math.min(height - framePad - 96, Math.max(230, height * (width >= 700 ? 0.52 : 0.48) + arcDropPx));
  const headingTapeClearance = desktopArc ? Math.max(160, height * 0.14) : 0;
  const radius = desktopArc
    ? Math.max(120, Math.min(width * 0.53, height * 0.74, cy - headingTapeClearance))
    : Math.max(120, Math.min(width * 0.58, height * 0.72));
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

function formatTrackedEta(minutes) {
  return Number.isFinite(minutes) ? `${Math.max(0, Math.round(minutes))} min` : "ETA ?";
}

function aircraftSpeed(plane) {
  const speed = Number(plane.speed);
  return Number.isFinite(speed) ? Math.max(0, speed) : 0;
}

function breadcrumbLimitForAircraft(plane) {
  if (isTrackedAircraft(plane)) return trackedBreadcrumbLimit;
  return normalBreadcrumbLimitForAircraft(plane);
}

function normalBreadcrumbLimitForAircraft(plane) {
  const speed = aircraftSpeed(plane);
  const speedFactor = speed <= 60 ? 0.45 : speed <= 160 ? 0.7 : speed <= 300 ? 1 : speed <= 450 ? 1.35 : 1.7;
  const slowAircraftFactor = speed <= 160 ? slowAircraftBreadcrumbMultiplier : 1;
  return Math.max(4, Math.min(40, Math.round(breadcrumbBaseLimit * speedFactor * slowAircraftFactor)));
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

function getRequiredAirspaceClasses() {
  const requiredClasses = getVisibleAirspaceClasses();
  if (!showSmallAirports) {
    requiredClasses.add("B");
    requiredClasses.add("C");
    requiredClasses.add("D");
  }
  return requiredClasses;
}

function applySavedAirspaceDefaults() {
  if (!airspaceToggles) return;
  for (const input of airspaceToggles.querySelectorAll("input[data-class]")) {
    const saved = window.localStorage.getItem(`ADSB_RADAR_AIRSPACE_CLASS_${input.dataset.class}`);
    if (saved === "true" || saved === "false") {
      input.checked = saved === "true";
    } else if (input.dataset.class === "SUA") {
      input.checked = true;
    }
  }
}

function airspaceStableId(airspace, index = 0) {
  return String(
    airspace?.id ||
      airspace?.ident ||
      `${airspace?.classCode || "?"}:${airspace?.name || "unnamed"}:${airspace?.lower || "--"}:${airspace?.upper || "--"}:${index}`
  );
}

function normalizeAirspaceSet(rows) {
  const byId = new Map();
  let duplicates = 0;
  rows.forEach((airspace, index) => {
    const id = airspaceStableId(airspace, index);
    if (byId.has(id)) duplicates += 1;
    byId.set(id, { ...airspace, id });
  });
  return {
    rows: Array.from(byId.values()).sort((a, b) =>
      `${a.classCode}:${a.name}:${a.id}`.localeCompare(`${b.classCode}:${b.name}:${b.id}`)
    ),
    duplicates
  };
}

function invalidateAirspaceLayer(reason) {
  airspaceLayerCache = null;
  trafficPipelineDiagnostics.airspaceLayoutInvalidationReason = reason;
}

function setAirspaces(nextRows, reason) {
  const normalized = normalizeAirspaceSet(nextRows || []);
  airspaces = normalized.rows;
  airportControlledAirspaceCache.clear();
  airspaceDatasetVersion += 1;
  airspaceLabelAnchorCache = new Map();
  trafficPipelineDiagnostics.airspaceFeatureCount = airspaces.length;
  trafficPipelineDiagnostics.airspaceDuplicateFeatureCount = normalized.duplicates;
  invalidateAirspaceLayer(reason);
  if (trafficDebugEnabled) {
    console.info("Airspace dataset updated", {
      reason,
      featureCount: airspaces.length,
      duplicateFeatureCount: normalized.duplicates,
      loadedTileIds: trafficPipelineDiagnostics.airspaceLoadedTileIds
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTrackingIdentifier(value, { assumeNNumber = false } = {}) {
  const cleaned = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  return assumeNNumber && !cleaned.startsWith("N") ? `N${cleaned}` : cleaned;
}

function normalizeNNumber(value) {
  return normalizeTrackingIdentifier(value, { assumeNNumber: true });
}

function loadTrackedAircraft() {
  try {
    const suppressedUntil = Number(window.localStorage.getItem("ADSB_RADAR_TRACKING_CLEARED_UNTIL") || "0");
    if (Number.isFinite(suppressedUntil) && Date.now() < suppressedUntil) {
      window.localStorage.removeItem("ADSB_RADAR_TRACKED_AIRCRAFT");
      return null;
    }
    const saved = JSON.parse(window.localStorage.getItem("ADSB_RADAR_TRACKED_AIRCRAFT") || "null");
    const nNumber = normalizeTrackingIdentifier(saved?.nNumber);
    const criterion = saved?.criterion === "time" ? "time" : "distance";
    const value = Number(saved?.value);
    const isolate = Boolean(saved?.isolate);
    if (!nNumber || !Number.isFinite(value) || value <= 0) return null;
    return { nNumber, criterion, value, isolate, alerted: false };
  } catch {
    return null;
  }
}

function saveTrackedAircraft() {
  if (!trackedAircraft) {
    window.localStorage.removeItem("ADSB_RADAR_TRACKED_AIRCRAFT");
    return;
  }

  window.localStorage.removeItem("ADSB_RADAR_TRACKING_CLEARED_UNTIL");
  window.localStorage.setItem(
    "ADSB_RADAR_TRACKED_AIRCRAFT",
    JSON.stringify({
      nNumber: trackedAircraft.nNumber,
      criterion: trackedAircraft.criterion,
      value: trackedAircraft.value,
      isolate: Boolean(trackedAircraft.isolate)
    })
  );
}

function trackingDebugSnapshot() {
  return {
    trackedAircraft: trackedAircraft ? { ...trackedAircraft } : null,
    savedTracking: window.localStorage.getItem("ADSB_RADAR_TRACKED_AIRCRAFT"),
    clearedUntilSeconds: trackedAircraftClearedUntil ? ((trackedAircraftClearedUntil - Date.now()) / 1000).toFixed(1) : "none",
    trackingButtonActive: Boolean(trackingOpen?.classList.contains("active")),
    shellTrackingActive: Boolean(shell?.classList.contains("tracking-active")),
    trackingAlertHidden: trackingAlertEl ? trackingAlertEl.hidden : null,
    highlightedAircraft: Array.from(aircraftHighlights.keys()).slice(0, 8)
  };
}

function logTrackingClearState(stage, extra = {}) {
  if (!trafficDebugEnabled) return;
  console.info("Tracking CLEAR diagnostics", {
    stage,
    ...extra,
    snapshot: trackingDebugSnapshot()
  });
}

function suppressTrackingRestore(durationMs = 5000) {
  trackedAircraftClearedUntil = Date.now() + durationMs;
  window.localStorage.setItem("ADSB_RADAR_TRACKING_CLEARED_UNTIL", String(trackedAircraftClearedUntil));
  window.setTimeout(() => {
    if (Date.now() >= trackedAircraftClearedUntil) {
      window.localStorage.removeItem("ADSB_RADAR_TRACKING_CLEARED_UNTIL");
      trackedAircraftClearedUntil = 0;
    }
  }, durationMs + 250);
}

function trackedAircraftKeyValue(plane) {
  const nNumber = normalizeNNumber(plane?.nNumber);
  if (nNumber) return nNumber;

  const callsign = normalizeTrackingIdentifier(plane?.callsign);
  if (callsign && !["UNKNOWN", "TISBOTHER", "TISB"].includes(callsign)) return callsign;
  return "";
}

function isTrackedAircraft(plane) {
  return Boolean(trackedAircraft?.nNumber && trackedAircraftKeyValue(plane) === trackedAircraft.nNumber);
}

function findTrackedAircraft() {
  if (!trackedAircraft?.nNumber) return null;
  return aircraft.find(isTrackedAircraft) || null;
}

function milesToNauticalMiles(miles) {
  return miles * 0.868976;
}

function preserveTrackedAircraftHistory(state = trackedAircraft, trackedPlane = findTrackedAircraft()) {
  if (!state?.nNumber) return;

  for (const [key, history] of tracks.entries()) {
    const livePlane = radarBlips.get(key) || aircraft.find((candidate) => aircraftKey(candidate) === key);
    const keyMatches = normalizeNNumber(key) === state.nNumber;
    const planeMatches = livePlane ? trackedAircraftKeyValue(livePlane) === state.nNumber : false;
    if (keyMatches || planeMatches) {
      const referencePlane = livePlane || (planeMatches ? trackedPlane : null) || trackedPlane || {};
      tracks.set(key, history.slice(-normalBreadcrumbLimitForAircraft(referencePlane)));
    }
  }
}

function quickNotesContext() {
  return quickNotesCanvas?.getContext("2d") || null;
}

function quickNotesPoint(event) {
  if (!quickNotesCanvas) return null;
  const rect = quickNotesCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.55
  };
}

function resizeQuickNotesCanvas() {
  if (!quickNotesCanvas) return;
  const rect = quickNotesCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (quickNotesCanvas.width !== width || quickNotesCanvas.height !== height) {
    quickNotesCanvas.width = width;
    quickNotesCanvas.height = height;
  }
  drawQuickNotes();
}

function drawQuickNotes() {
  const noteCtx = quickNotesContext();
  if (!noteCtx || !quickNotesCanvas) return;
  const width = quickNotesCanvas.width;
  const height = quickNotesCanvas.height;
  noteCtx.clearRect(0, 0, width, height);
  noteCtx.lineCap = "round";
  noteCtx.lineJoin = "round";
  noteCtx.strokeStyle = lightTheme ? "rgba(43, 35, 145, 0.88)" : "rgba(255, 232, 150, 0.9)";

  if (quickNotesText) {
    noteCtx.save();
    const ratio = window.devicePixelRatio || 1;
    noteCtx.fillStyle = lightTheme ? "rgba(17, 28, 98, 0.94)" : "rgba(233, 255, 243, 0.92)";
    noteCtx.font = `950 ${Math.round(28 * ratio)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    noteCtx.textBaseline = "top";
    const words = quickNotesText.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    const maxWidth = Math.max(120 * ratio, width - 28 * ratio);
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (noteCtx.measureText(nextLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    }
    if (line) lines.push(line);
    const x = 14 * ratio;
    const y = 12 * ratio;
    const lineHeight = 34 * ratio;
    lines.slice(0, 3).forEach((text, index) => noteCtx.fillText(text, x, y + index * lineHeight));
    noteCtx.restore();
  }

  for (const stroke of quickNoteStrokes) {
    if (!stroke.points.length) continue;
    const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
    noteCtx.lineWidth = Math.max(2, Math.min(7, pressure * 6)) * (window.devicePixelRatio || 1);
    noteCtx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) noteCtx.moveTo(x, y);
      else noteCtx.lineTo(x, y);
    });
    noteCtx.stroke();
  }
}

function setQuickNotesVisible(visible) {
  if (!quickNotes) return;
  quickNotes.hidden = !visible;
  if (visible) window.requestAnimationFrame(resizeQuickNotesCanvas);
}

function beginQuickNote(event) {
  if (!weatherMode) return;
  const point = quickNotesPoint(event);
  if (!point) return;
  event.preventDefault();
  quickNotesCanvas?.setPointerCapture?.(event.pointerId);
  activeQuickNoteStroke = { points: [point] };
  quickNoteStrokes.push(activeQuickNoteStroke);
  drawQuickNotes();
}

function continueQuickNote(event) {
  if (!activeQuickNoteStroke) return;
  const point = quickNotesPoint(event);
  if (!point) return;
  event.preventDefault();
  activeQuickNoteStroke.points.push(point);
  drawQuickNotes();
}

function endQuickNote(event) {
  if (!activeQuickNoteStroke) return;
  quickNotesCanvas?.releasePointerCapture?.(event.pointerId);
  activeQuickNoteStroke = null;
}

function clearQuickNotes() {
  quickNoteStrokes = [];
  activeQuickNoteStroke = null;
  quickNotesText = "";
  drawQuickNotes();
}

function openAtcScratchpad(event) {
  event.preventDefault();
  event.stopPropagation();
  window.webkit?.messageHandlers?.scratchpad?.postMessage({ type: "open" });
}

window.addEventListener("adsb-set-quick-note-text", (event) => {
  quickNotesText = String(event.detail?.text || "").trim();
  if (quickNotesText) quickNoteStrokes = [];
  window.requestAnimationFrame(drawQuickNotes);
});

function cancelQuickNotesClearHold() {
  if (quickNotesClearTimer) {
    window.clearTimeout(quickNotesClearTimer);
    quickNotesClearTimer = null;
  }
  quickNotesClearStartedAt = 0;
  quickNotesClear?.classList.remove("holding");
}

function beginQuickNotesClearHold(event) {
  event.preventDefault();
  event.stopPropagation();
  cancelQuickNotesClearHold();
  quickNotesClearStartedAt = Date.now();
  quickNotesClear?.classList.add("holding");
  quickNotesClear?.setPointerCapture?.(event.pointerId);
  quickNotesClearTimer = window.setTimeout(() => {
    quickNotesClearTimer = null;
    clearQuickNotes();
    cancelQuickNotesClearHold();
  }, 1050);
}

function finishQuickNotesClearHold(event) {
  event.preventDefault();
  event.stopPropagation();
  quickNotesClear?.releasePointerCapture?.(event.pointerId);
  if (quickNotesClearStartedAt && Date.now() - quickNotesClearStartedAt >= 1000) {
    clearQuickNotes();
  }
  cancelQuickNotesClearHold();
}

function planeLabel(plane) {
  const callsign = usefulAircraftCallsign(plane);
  if (callsign || plane.registration || plane.nNumber) return callsign || plane.registration || plane.nNumber;
  const icaoHex = normalizeIcaoHex(plane.hex || plane.icao);
  if (icaoHex) return `ICAO ${icaoHex}`;
  const trackId = plane.faaTrackNumber || plane.hex;
  return trackId ? `TRACK ${String(trackId).toUpperCase()}` : "Unknown";
}

function usefulAircraftCallsign(plane) {
  const callsign = String(plane?.callsign || "").trim().toUpperCase();
  return callsign && !["UNKNOWN", "TISB_OTHER", "TIS-B", "TISBOTHER"].includes(callsign) ? callsign : "";
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
  const type = String(plane.displayType || plane.type || plane.resolvedType || "").trim();
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
  const registryType = [plane.manufacturer, plane.model].filter(Boolean).join(" ").trim();
  if (registryType) return titleCaseAircraftText(registryType);
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

async function enrichAircraftIdentities(nextAircraft) {
  const byHex = new Map();
  for (const plane of nextAircraft) {
    const hex = normalizeIcaoHex(plane.hex || plane.icao);
    if (!hex) continue;
    if (!byHex.has(hex)) byHex.set(hex, []);
    byHex.get(hex).push(plane);
  }

  await Promise.all(
    [...byHex.entries()].map(async ([hex, planes]) => {
      const record = await faaAircraftRegistry.resolve(hex);
      if (!record) return;
      for (const plane of planes) {
        plane.registration = plane.registration || plane.nNumber || record.registration;
        plane.nNumber = plane.nNumber || record.registration;
        plane.manufacturer = plane.manufacturer || record.manufacturer;
        plane.model = plane.model || record.model;
        plane.aircraftCategory = plane.aircraftCategory || record.category;
        plane.registryYear = plane.registryYear || record.year;
        plane.displayType = plane.displayType || record.displayType;
        plane.identitySource = "FAA_REGISTRY";
      }
    })
  );
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
  const theme = currentRadarTheme();
  const altitude = Number(plane.altitude);
  if (Number.isFinite(altitude) && altitude >= 18000) {
    return {
      target: platformColors.red,
      trail: `rgba(${platformColors.redRgb}, ${isAndroidWeb ? 0.82 : 0.7})`
    };
  }
  if (Number.isFinite(altitude) && altitude >= 10000) {
    return {
      target: theme.midTarget,
      trail: lightTheme ? "rgba(181, 76, 0, 0.66)" : "rgba(255, 157, 53, 0.66)"
    };
  }
  return {
    target: theme.lowTarget,
    trail: theme.lowTrail
  };
}

function isVisibleTraffic(plane) {
  if (trackedAircraft?.isolate) return isTrackedAircraft(plane);
  if (!showGroundTraffic && isGroundTraffic(plane)) return false;
  if (!showFlightLevelsTraffic && isFlightLevelTraffic(plane)) return false;
  return true;
}

function visibleAircraft() {
  return aircraft.filter(isVisibleTraffic);
}

function isDisplayTraffic(plane) {
  if (!isVisibleTraffic(plane)) return false;
  if (wxDisplayMode !== "wxOnly") return true;
  if (!trafficAlertActive || !proximityAlertKey) return false;
  return aircraftKey(plane) === proximityAlertKey;
}

function displayAircraft() {
  return aircraft.filter(isDisplayTraffic);
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

function updateTrackedAircraftHistory(nextAircraft) {
  if (!trackedAircraft?.nNumber) return;
  const trackedPlane = nextAircraft.find((plane) => isTrackedAircraft(plane));
  if (!trackedPlane) return;
  if (milesBetween(center.lat, center.lon, trackedPlane.lat, trackedPlane.lon) > trackedBreadcrumbRangeMiles) return;
  appendTrackHistory(trackedPlane);
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

function trafficReportTimestamp(plane, receivedAt = Date.now()) {
  const sourceTimestamp = sourcePositionTimestamp(plane);
  if (Number.isFinite(sourceTimestamp)) return sourceTimestamp;

  const seenSeconds = Number(plane.seen);
  if (Number.isFinite(seenSeconds) && seenSeconds >= 0) return receivedAt - seenSeconds * 1000;
  return receivedAt;
}

function trafficPositionChanged(previousPlane, nextPlane) {
  return coordinatesMateriallyChanged(previousPlane, nextPlane);
}

function finiteMotionValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function predictionCorrectionDistance(previousDisplayPlane, confirmedPlane) {
  if (!previousDisplayPlane?.predicted) return null;
  const correctionMiles = distanceMilesBetween(
    previousDisplayPlane.lat,
    previousDisplayPlane.lon,
    confirmedPlane.lat,
    confirmedPlane.lon
  );
  return Number.isFinite(correctionMiles) ? correctionMiles : null;
}

function isPredictionDebugTarget(plane) {
  const key = aircraftKey(plane);
  return isTrackedAircraft(plane) || (proximityAlertKey && key === proximityAlertKey);
}

function recordPredictionCorrection(plane, previousState, confirmedTimestamp) {
  const projectedAtConfirmation = projectInternetTrafficState(previousState, confirmedTimestamp);
  const correctionMiles = predictionCorrectionDistance(projectedAtConfirmation, plane);
  if (!Number.isFinite(correctionMiles)) return;

  const sample = {
    key: aircraftKey(plane),
    callsign: plane.callsign || plane.nNumber || plane.hex || aircraftKey(plane),
    confirmedTimestamp,
    predictionAgeSeconds: Number(projectedAtConfirmation.predictionAgeSeconds || 0),
    correctionMeters: Number((correctionMiles * 1609.344).toFixed(1)),
    correctionNm: Number((correctionMiles * 0.868976).toFixed(3))
  };
  trafficPipelineDiagnostics.predictionCorrections.push(sample);
  trafficPipelineDiagnostics.predictionCorrections = trafficPipelineDiagnostics.predictionCorrections.slice(-120);

  if (trafficDebugEnabled && isPredictionDebugTarget(plane)) {
    console.info("Traffic prediction corrected", {
      ...sample,
      confirmedPosition: { lat: plane.lat, lon: plane.lon },
      projectedPosition: { lat: projectedAtConfirmation.lat, lon: projectedAtConfirmation.lon }
    });
  }
}

function projectInternetTrafficState(state, now = Date.now()) {
  const projected = projectConfirmedTraffic(state, now);
  if (!projected) return null;

  return {
    ...state.pendingPlane,
    lat: projected.lat,
    lon: projected.lon,
    altitude: projected.altitude,
    predicted: true,
    displayPositionSource: "PREDICTED",
    predictionAgeSeconds: projected.predictionAgeSeconds,
    predictionGeneratedAt: projected.predictionGeneratedAt,
    confirmedLat: state.confirmedLat,
    confirmedLon: state.confirmedLon,
    confirmedAltitude: state.confirmedAltitude,
    confirmedTrack: state.confirmedTrack,
    confirmedGroundSpeed: state.confirmedGroundSpeed,
    confirmedVerticalRate: state.confirmedVerticalRate,
    confirmedTimestamp: state.confirmedTimestamp
  };
}

function ingestTrafficPositions(
  nextAircraft,
  receivedAt = Date.now(),
  { sourceType = "unknown", snapshotId = "", responseMetadata = {} } = {}
) {
  const seenKeys = new Set();

  for (const plane of nextAircraft) {
    const key = aircraftKey(plane);
    if (!key) continue;
    seenKeys.add(key);

    const previous = trafficTargetStates.get(key);
    const reportTimestamp = trafficReportTimestamp(plane, receivedAt);
    const previousReportTimestamp = Number(previous?.lastValidPositionTimestamp || 0);
    const reportChanged = Math.abs(reportTimestamp - previousReportTimestamp) > 1;
    const positionChanged = trafficPositionChanged(previous?.pendingPlane || previous?.displayPlane, plane);
    const sourceChanged = Boolean(previous && previous.sourceType !== sourceType);
    const observation =
      sourceType === "internet" || sourceType === "faa"
        ? classifyInternetPositionObservation(previous, plane, snapshotId)
        : {
            isNewPosition: !previous || sourceChanged || reportChanged || positionChanged,
            reason: !previous
              ? "first observation"
              : sourceChanged
                ? "traffic source changed"
                : reportChanged
                  ? "source report timestamp advanced"
                  : positionChanged
                    ? "coordinates changed"
                    : "duplicate observation",
            positionTimestamp: reportTimestamp,
            snapshotId: ""
          };
    const hasFreshPosition = !previous || sourceChanged || observation.isNewPosition;
    const confirmedTimestamp = observation.positionTimestamp ?? receivedAt;
    const nativeTrack = finiteMotionValue(plane.track);
    const nativeSpeed = finiteMotionValue(plane.speed);
    const derivedMotion =
      hasFreshPosition && sourceType === "faa" && previous && !sourceChanged
        ? deriveConfirmedMotion(previous, plane, confirmedTimestamp)
        : {
            accepted: false,
            reason: previous ? "no new FAA position" : "first FAA position",
            track: finiteMotionValue(previous?.derivedTrack ?? previous?.confirmedTrack),
            groundspeed: finiteMotionValue(previous?.derivedGroundSpeed ?? previous?.confirmedGroundSpeed)
          };
    const effectiveTrack = nativeTrack ?? derivedMotion.track;
    const effectiveGroundSpeed = nativeSpeed ?? derivedMotion.groundspeed;
    const confirmedPlane = {
      ...plane,
      track: effectiveTrack,
      speed: effectiveGroundSpeed,
      derivedTrack: sourceType === "faa" && nativeTrack === null ? effectiveTrack : null,
      derivedGroundSpeed: sourceType === "faa" && nativeSpeed === null ? effectiveGroundSpeed : null,
      motionSource:
        nativeTrack !== null && nativeSpeed !== null
          ? "SOURCE"
          : derivedMotion.accepted
            ? "CONFIRMED_POSITIONS"
            : effectiveTrack !== null
              ? "PREVIOUS_CONFIRMED_MOTION"
              : "UNKNOWN"
    };
    const positionSequence = hasFreshPosition ? ++trafficPositionSequence : previous.positionSequence;
    const pendingPlane = {
      ...(previous?.pendingPlane || {}),
      ...confirmedPlane,
      positionReceivedAt: receivedAt,
      lastValidPositionTimestamp: hasFreshPosition
        ? observation.positionTimestamp ?? receivedAt
        : previous?.lastValidPositionTimestamp ?? observation.positionTimestamp ?? receivedAt,
      positionSequence
    };

    if (hasFreshPosition && (sourceType === "internet" || sourceType === "faa")) {
      recordPredictionCorrection(confirmedPlane, previous, confirmedTimestamp);
    }

    trafficTargetStates.set(key, {
      key,
      pendingPlane,
      displayPlane: previous?.displayPlane || null,
      positionSequence,
      lastSweepSeenSequence: previous?.lastSweepSeenSequence || 0,
      lastValidPositionTimestamp: hasFreshPosition
        ? observation.positionTimestamp ?? receivedAt
        : previous?.lastValidPositionTimestamp ?? observation.positionTimestamp ?? receivedAt,
      previousValidPositionTimestamp: hasFreshPosition
        ? previous?.lastValidPositionTimestamp || null
        : previous?.previousValidPositionTimestamp || null,
      lastIngestAt: receivedAt,
      receivedFreshPositionSinceLastSweep: Boolean(hasFreshPosition || previous?.receivedFreshPositionSinceLastSweep),
      opacity: previous?.opacity ?? 1,
      sourceType,
      previousConfirmedLat: hasFreshPosition ? previous?.confirmedLat ?? null : previous?.previousConfirmedLat ?? null,
      previousConfirmedLon: hasFreshPosition ? previous?.confirmedLon ?? null : previous?.previousConfirmedLon ?? null,
      previousConfirmedTimestamp: hasFreshPosition
        ? previous?.confirmedTimestamp ?? null
        : previous?.previousConfirmedTimestamp ?? null,
      confirmedLat: hasFreshPosition ? confirmedPlane.lat : previous?.confirmedLat ?? confirmedPlane.lat,
      confirmedLon: hasFreshPosition ? confirmedPlane.lon : previous?.confirmedLon ?? confirmedPlane.lon,
      confirmedAltitude: hasFreshPosition
        ? confirmedPlane.altitude
        : previous?.confirmedAltitude ?? confirmedPlane.altitude,
      confirmedTrack: hasFreshPosition
        ? effectiveTrack
        : previous?.confirmedTrack ?? effectiveTrack,
      confirmedGroundSpeed: hasFreshPosition
        ? effectiveGroundSpeed
        : previous?.confirmedGroundSpeed ?? effectiveGroundSpeed,
      confirmedVerticalRate: hasFreshPosition
        ? confirmedPlane.verticalRate
        : previous?.confirmedVerticalRate ?? confirmedPlane.verticalRate,
      confirmedTimestamp: hasFreshPosition
        ? confirmedTimestamp
        : previous?.confirmedTimestamp ?? confirmedTimestamp,
      derivedTrack: hasFreshPosition
        ? sourceType === "faa" && nativeTrack === null
          ? effectiveTrack
          : null
        : previous?.derivedTrack ?? null,
      derivedGroundSpeed: hasFreshPosition
        ? sourceType === "faa" && nativeSpeed === null
          ? effectiveGroundSpeed
          : null
        : previous?.derivedGroundSpeed ?? null,
      motionDerivation: hasFreshPosition ? derivedMotion : previous?.motionDerivation ?? derivedMotion,
      confirmedSnapshotId: hasFreshPosition
        ? observation.snapshotId || snapshotId
        : previous?.confirmedSnapshotId || observation.snapshotId || snapshotId,
      lastReceivedSnapshotId: observation.snapshotId || snapshotId,
      lastObservationDecision: observation.reason,
      lastResponseMetadata: responseMetadata
    });

    if (trafficDebugEnabled && isPredictionDebugTarget(plane)) {
    console.info(sourceType === "faa" ? "FAA TAIS traffic ingestion" : "Internet traffic ingestion", {
        receivedAt,
        snapshotId: observation.snapshotId || snapshotId || "--",
        hex: plane.hex,
        callsign: plane.callsign,
        receivedPosition: { lat: confirmedPlane.lat, lon: confirmedPlane.lon },
        sourcePositionTimestamp: observation.positionTimestamp,
        previousConfirmedPosition: previous
          ? { lat: previous.confirmedLat, lon: previous.confirmedLon }
          : null,
        previousConfirmedTimestamp: previous?.confirmedTimestamp ?? null,
        classifiedAsNewPosition: hasFreshPosition,
        positionSequence,
        reason: observation.reason,
        sourceIdentity: confirmedPlane.icao || confirmedPlane.hex || key,
        faaTrackIdentity:
          confirmedPlane.sourceFacility && confirmedPlane.faaTrackNumber
            ? `${confirmedPlane.sourceFacility}-${confirmedPlane.faaTrackNumber}`
            : "--",
        derivedTrack: effectiveTrack,
        derivedGroundSpeed: effectiveGroundSpeed,
        motionDerivation: derivedMotion,
        predictionOriginReset: hasFreshPosition && (sourceType === "internet" || sourceType === "faa")
      });
    }
  }

  const staleCutoff = receivedAt - 10 * 60 * 1000;
  for (const [key, state] of trafficTargetStates.entries()) {
    if (!seenKeys.has(key) && Number(state.lastIngestAt || 0) < staleCutoff) {
      trafficTargetStates.delete(key);
    }
  }
}

function trafficSweepFadeStep() {
  const fadeSweeps = Math.max(3, Math.round(radarFadeMs / (sweepSeconds * 1000)));
  return 1 / fadeSweeps;
}

function removeTrafficTargetPresentation(key) {
  radarBlips.delete(key);
  trafficTargetStates.delete(key);
}

function processTrafficSweepPresentation(
  previousBearing,
  currentBearing,
  { mode = "radar", sweepPassId = "", direction = "clockwise" } = {}
) {
  const now = Date.now();
  const fadeStep = trafficSweepFadeStep();
  let fresh = 0;
  let fading = 0;
  let predicted = 0;
  let removed = 0;
  let debugState = null;

  for (const [key, state] of trafficTargetStates.entries()) {
    const pendingPlane = state.pendingPlane;
    const currentBlip = radarBlips.get(key);
    const referencePlane = pendingPlane || currentBlip;
    if (!referencePlane) {
      removeTrafficTargetPresentation(key);
      removed += 1;
      continue;
    }

    const targetTooOld = now - Number(state.lastValidPositionTimestamp || state.lastIngestAt || 0) > 10 * 60 * 1000;
    const outOfRange = milesBetween(center.lat, center.lon, referencePlane.lat, referencePlane.lon) > radiusMiles + 1;
    if (targetTooOld || outOfRange) {
      removeTrafficTargetPresentation(key);
      removed += 1;
      continue;
    }

    const hasFreshPosition = state.positionSequence !== state.lastSweepSeenSequence;
    const confirmedCandidate = hasFreshPosition
      ? { ...pendingPlane, predicted: false, displayPositionSource: "CONFIRMED", predictionAgeSeconds: 0 }
      : null;
    const predictedPlane = hasFreshPosition ? null : projectInternetTrafficState(state, now);
    const candidatePlane = confirmedCandidate || predictedPlane || currentBlip || pendingPlane;
    const candidateBearing = bearingDegrees(center.lat, center.lon, candidatePlane.lat, candidatePlane.lon);
    // The 360 sweep arm rotates in screen space. Track Up rotates traffic beneath it,
    // so gate each return on its displayed bearing rather than its raw compass bearing.
    const candidateSweepBearing =
      mode === "radar"
        ? displaySweepBearing(candidateBearing, radarRotationDegrees())
        : candidateBearing;
    const crossed =
      state.lastPaintedSweepPassId !== sweepPassId &&
      sweepCrossedBearing(previousBearing, currentBearing, candidateSweepBearing, { direction });
    if (!crossed) continue;

    const decision = sweepPaintDecision(
      { opacity: currentBlip?.radarOpacity ?? state.opacity ?? 1 },
      { crossed, confirmedCandidate, predictedCandidate: predictedPlane, fadeStep }
    );
    if (decision.action === "remove") {
      removeTrafficTargetPresentation(key);
      removed += 1;
      continue;
    }

    const nextOpacity = decision.opacity;
    const displayPlane = decision.candidate || currentBlip || pendingPlane;
    const nextBlip = {
      ...displayPlane,
      radarSeenAt: hasFreshPosition ? now : currentBlip?.radarSeenAt || now,
      liveUpdatedAt: pendingPlane?.positionReceivedAt || currentBlip?.liveUpdatedAt || now,
      radarOpacity: nextOpacity,
      lastRenderedSweep: sweepSequence,
      lastSweepPassId: sweepPassId,
      lastPaintedBearing: candidateBearing,
      lastPositionSequence: state.positionSequence
    };

    radarBlips.set(key, nextBlip);
    trafficTargetStates.set(key, {
      ...state,
      displayPlane: nextBlip,
      lastSweepSeenSequence: hasFreshPosition ? state.positionSequence : state.lastSweepSeenSequence,
      receivedFreshPositionSinceLastSweep: false,
      opacity: nextOpacity,
      lastRenderedSweep: sweepSequence,
      lastPaintedBearing: candidateBearing,
      lastPaintedSweepPassId: sweepPassId
    });

    if (hasFreshPosition) {
      fresh += 1;
      appendTrackHistory(nextBlip);
    } else if (predictedPlane) {
      predicted += 1;
    } else {
      fading += 1;
    }

    if (!debugState || isTrackedAircraft(nextBlip) || key === proximityAlertKey) {
      const latestCorrection = [...trafficPipelineDiagnostics.predictionCorrections]
        .reverse()
        .find((sample) => sample.key === key);
      debugState = {
        key,
        callsign: nextBlip.callsign || nextBlip.nNumber || nextBlip.hex || key,
        sourceIdentity: nextBlip.icao || nextBlip.hex || key,
        faaTrackIdentity:
          nextBlip.sourceFacility && nextBlip.faaTrackNumber
            ? `${nextBlip.sourceFacility}-${nextBlip.faaTrackNumber}`
            : "--",
        mode,
        sweepSequence,
        fresh: hasFreshPosition,
        displayPositionSource: nextBlip.displayPositionSource || "CONFIRMED",
        predictionAgeSeconds: Number(Number(nextBlip.predictionAgeSeconds || 0).toFixed(1)),
        previousConfirmedPosition:
          finiteMotionValue(state.previousConfirmedLat) !== null && finiteMotionValue(state.previousConfirmedLon) !== null
            ? { lat: state.previousConfirmedLat, lon: state.previousConfirmedLon }
            : null,
        confirmedPosition: { lat: state.confirmedLat, lon: state.confirmedLon },
        confirmedTimestamp: state.confirmedTimestamp,
        previousConfirmedTimestamp: state.previousConfirmedTimestamp,
        derivedTrack: state.derivedTrack,
        derivedGroundSpeed: state.derivedGroundSpeed,
        motionDerivation: state.motionDerivation,
        displayedPosition: { lat: nextBlip.lat, lon: nextBlip.lon },
        displayedTimestamp: nextBlip.predictionGeneratedAt || now,
        opacity: Number(nextOpacity.toFixed(2)),
        positionSequence: state.positionSequence,
        confirmedSnapshotId: state.confirmedSnapshotId || "--",
        receivedSnapshotId: state.lastReceivedSnapshotId || "--",
        observationDecision: state.lastObservationDecision || "--",
        provider: state.lastResponseMetadata?.provider || "--",
        cacheSource: state.lastResponseMetadata?.cacheSource || "--",
        upstreamFetchedAt: state.lastResponseMetadata?.upstreamFetchedAt || null,
        lastSweepSeenSequence: hasFreshPosition ? state.positionSequence : state.lastSweepSeenSequence,
        reportAgeSeconds: Number(((now - Number(state.lastValidPositionTimestamp || now)) / 1000).toFixed(1)),
        reportIntervalSeconds:
          state.previousValidPositionTimestamp && state.lastValidPositionTimestamp
            ? Number(((state.lastValidPositionTimestamp - state.previousValidPositionTimestamp) / 1000).toFixed(1))
            : null,
        latestCorrectionErrorMeters: latestCorrection?.correctionMeters ?? null,
        latestCorrectionErrorNm: latestCorrection?.correctionNm ?? null
      };
    }
  }

  trafficPipelineDiagnostics.sweepCount = sweepSequence;
  trafficPipelineDiagnostics.sweepPeriodSeconds = mode === "wx" ? wxSweepSeconds : sweepSeconds;
  trafficPipelineDiagnostics.freshTargetsThisSweep = fresh;
  trafficPipelineDiagnostics.predictedTargetsThisSweep = predicted;
  trafficPipelineDiagnostics.fadingTargetsThisSweep = fading;
  trafficPipelineDiagnostics.removedTargetsThisSweep = removed;
  trafficPipelineDiagnostics.debugTargetKey = debugState?.key || "";
  trafficPipelineDiagnostics.debugTargetState = debugState;

  if (trafficDebugEnabled && debugState) {
    console.info("Sweep traffic presentation", {
      sweepSequence,
      mode,
      previousBearing,
      currentBearing,
      sweepPassId,
      freshTargets: fresh,
      predictedTargets: predicted,
      fadingTargets: fading,
      removedTargets: removed,
      liveTargets: trafficTargetStates.size,
      debugTarget: debugState
    });
  }
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
    }
  }
}

function refreshLiveStratusBlips(nextAircraft, data = {}) {
  const source = String(data.source || data.displaySource || "").toLowerCase();
  if (!source.includes("stratus") || data.stale) return;
  ingestTrafficPositions(nextAircraft, Date.now(), { sourceType: "stratus" });
}

function radarBlipAlpha(plane, now = Date.now()) {
  if (Number.isFinite(Number(plane.radarOpacity))) return Math.max(0, Math.min(1, Number(plane.radarOpacity)));

  const age = now - (plane.radarSeenAt || 0);
  const sweepAlpha = Math.max(0, Math.min(1, 1 - age / radarFadeMs));
  const liveAge = now - (plane.liveUpdatedAt || 0);
  const liveAlpha = liveAge <= 3500 ? 0.58 : liveAge <= 9000 ? Math.max(0, 0.58 * (1 - (liveAge - 3500) / 5500)) : 0;
  return Math.max(sweepAlpha, liveAlpha);
}

function pruneExpiredRadarBlips(now = Date.now()) {
  for (const [key, plane] of radarBlips.entries()) {
    if (radarBlipAlpha(plane, now) <= 0) {
      radarBlips.delete(key);
    }
  }
}

function visibleRadarAircraft() {
  const now = Date.now();
  return Array.from(radarBlips.values()).filter((plane) => radarBlipAlpha(plane, now) > 0 && isDisplayTraffic(plane));
}

function updateRadarBlipsForSweep(angle) {
  const currentSweepAngle = normalizeRadians(angle);

  for (const plane of visibleRadarAircraft()) {
    const targetAngle = planeSweepAngle(plane);
    if (!sweepCrossedAngle(previousSweepAngle, currentSweepAngle, targetAngle)) continue;
    if (radarBlipAlpha(plane) > 0.85 && wxDisplayMode !== "wxOnly") playContactBlip();
  }

  previousSweepAngle = currentSweepAngle;
}

function angularDifference(a, b) {
  const difference = Math.abs(normalizeRadians(a) - normalizeRadians(b));
  return Math.min(difference, Math.PI * 2 - difference);
}

function updateRadarBlipsForWeatherSweep(angle) {
  const currentSweepAngle = normalizeRadians(angle);

  for (const plane of visibleRadarAircraft()) {
    const targetAngle = planeSweepAngle(plane);
    if (angularDifference(currentSweepAngle, targetAngle) > 0.16) continue;
    if (radarBlipAlpha(plane) > 0.85 && wxDisplayMode !== "wxOnly") playContactBlip();
  }
}

async function getJson(url) {
  return fetchJsonWithTimeout(url, { timeoutMs: 4500 });
}

async function loadAirportCache() {
  const tileKey = offlineTileIdsForView(1.9).sort().join("|");
  if (airportRowsCache && airportRowsCacheTileKey === tileKey) {
    refreshAirportCacheInBackground();
    return airportRowsCache;
  }

  if (!airportsCachePromise || airportRowsCacheTileKey !== tileKey) {
    airportRowsCacheTileKey = tileKey;
    airportsCachePromise = loadLocalAirportRows();
  }

  airportRowsCache = await airportsCachePromise;
  airportRowsCacheTileKey = tileKey;
  refreshAirportCacheInBackground();
  return airportRowsCache;
}

async function loadRunwayCache() {
  if (runwayRowsCache) {
    refreshRunwayCacheInBackground();
    return runwayRowsCache;
  }

  if (!runwaysCachePromise) {
    runwaysCachePromise = loadLocalRunwayRows();
  }

  runwayRowsCache = await runwaysCachePromise;
  refreshRunwayCacheInBackground();
  return runwayRowsCache;
}

function normalizeBundledAirportRows(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.airports;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((airport) => ({
      ident: airport.ident,
      name: airport.name || airport.ident,
      type: airport.type || "small_airport",
      lat: parseNumber(airport.lat),
      lon: parseNumber(airport.lon),
      elevationFt: parseNumber(airport.elevationFt),
      municipality: airport.municipality || "",
      state: airport.state || "",
      isoRegion: airport.isoRegion || airport.region || "",
      icao: airport.icao || airport.gpsCode || "",
      gpsCode: airport.gpsCode || airport.icao || "",
      localCode: airport.localCode || airport.faa || "",
      iata: airport.iata || "",
      runways: Array.isArray(airport.runways) ? airport.runways : []
    }))
    .filter((airport) => airport.ident && Number.isFinite(airport.lat) && Number.isFinite(airport.lon));
}

function normalizeBundledRunwayRows(payload) {
  const airportRows = Array.isArray(payload) ? payload : payload?.airports;
  if (!Array.isArray(airportRows)) return [];

  return airportRows.flatMap((airport) =>
    (Array.isArray(airport.runways) ? airport.runways : []).map((runway) => ({
      airportIdent: airport.ident,
      leIdent: runway.leIdent,
      heIdent: runway.heIdent,
      leLat: parseNumber(runway.leLat),
      leLon: parseNumber(runway.leLon),
      heLat: parseNumber(runway.heLat),
      heLon: parseNumber(runway.heLon),
      lengthFt: parseNumber(runway.lengthFt),
      widthFt: parseNumber(runway.widthFt),
      leHeading: parseNumber(runway.leHeading),
      heHeading: parseNumber(runway.heHeading)
    })))
    .filter(
      (runway) =>
        runway.airportIdent &&
        Number.isFinite(runway.leLat) &&
        Number.isFinite(runway.leLon) &&
        Number.isFinite(runway.heLat) &&
        Number.isFinite(runway.heLon)
    );
}

function mergeRowsByKey(primaryRows, fallbackRows, keyName) {
  const merged = new Map();
  for (const row of fallbackRows || []) {
    if (row?.[keyName]) merged.set(row[keyName], row);
  }
  for (const row of primaryRows || []) {
    if (row?.[keyName]) merged.set(row[keyName], row);
  }
  return Array.from(merged.values());
}

async function loadBundledAirportSeed() {
  try {
    const payload = await fetchJsonWithTimeout(bundledAirportsUrl, {
      timeoutMs: 1200,
      cache: "force-cache"
    });
    return payload;
  } catch (error) {
    console.warn("Bundled airport seed unavailable", error);
    return null;
  }
}

async function loadBundledTileIndex() {
  if (!bundledTileIndexPromise) {
    bundledTileIndexPromise = fetchJsonWithTimeout(bundledTileIndexUrl, {
      timeoutMs: 900,
      cache: "force-cache"
    }).catch((error) => {
      console.warn("Bundled offline tile index unavailable; falling back to national files", error);
      return null;
    });
  }
  return bundledTileIndexPromise;
}

async function loadBundledAirportTile(tileId, tileInfo) {
  if (!tileInfo?.file) return [];
  if (!bundledAirportTilePromises.has(tileId)) {
    bundledAirportTilePromises.set(
      tileId,
      fetchJsonWithTimeout(new URL(tileInfo.file, bundledTilesBaseUrl).href, {
        timeoutMs: 900,
        cache: "force-cache"
      })
        .then(normalizeBundledAirportRows)
        .catch((error) => {
          console.warn(`Bundled airport tile ${tileId} unavailable`, error);
          return [];
        })
    );
  }
  return bundledAirportTilePromises.get(tileId);
}

async function loadLocalAirportTileRows() {
  const index = await loadBundledTileIndex();
  if (!index?.airports) return [];
  const tileIds = offlineTileIdsForView(1.9);
  const rows = (await Promise.all(tileIds.map((tileId) => loadBundledAirportTile(tileId, index.airports[tileId])))).flat();
  return mergeRowsByKey(rows, [], "ident");
}

async function loadLocalAirportRows() {
  const persisted = storageReadJson("ADSB_RADAR_AIRPORT_ROWS", []);
  const tiledRows = await loadLocalAirportTileRows();
  const bundledRows = tiledRows.length ? tiledRows : normalizeBundledAirportRows(await loadBundledAirportSeed());
  const rows = mergeRowsByKey(persisted, bundledRows, "ident");
  offlineAirportDataActive = rows.length > 0;
  return rows;
}

async function loadNationwideAirportSearchRows() {
  if (!nationwideAirportSearchPromise) {
    nationwideAirportSearchPromise = loadBundledAirportSeed()
      .then(normalizeBundledAirportRows)
      .then((rows) => mergeRowsByKey(rows, storageReadJson("ADSB_RADAR_AIRPORT_ROWS", []), "ident"))
      .catch((error) => {
        console.warn("Nationwide airport search unavailable; using visible local airport cache", error);
        return loadAirportCache();
      });
  }
  return nationwideAirportSearchPromise;
}

function airportContextLabel(airport) {
  const parts = [airport.municipality, airport.state, airport.isoRegion]
    .map((part) => String(part || "").replace(/^US-/, "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function airportSearchText(airport) {
  return [
    airport.ident,
    airport.icao,
    airport.gpsCode,
    airport.localCode,
    airport.iata,
    airport.name,
    airport.municipality,
    airport.state,
    airport.isoRegion
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreAirportSearchResult(airport, query) {
  const q = query.toLowerCase().trim();
  if (!q) return -1;
  const identifiers = [airport.ident, airport.icao, airport.gpsCode, airport.localCode, airport.iata]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (identifiers.some((value) => value === q)) return 100000 + airportSizeScore(airport);
  if (identifiers.some((value) => value.startsWith(q))) return 80000 + airportSizeScore(airport);
  const name = String(airport.name || "").toLowerCase();
  if (name === q) return 70000 + airportSizeScore(airport);
  if (name.startsWith(q)) return 60000 + airportSizeScore(airport);
  const context = airportSearchText(airport);
  if (context.includes(q)) return 30000 + airportSizeScore(airport);
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => context.includes(word))) return 20000 + airportSizeScore(airport);
  return -1;
}

function renderAirportSearchResults(results) {
  if (!airportSearchResults || !airportSearchInput) return;
  airportSearchResults.innerHTML = "";
  if (!results.length) {
    airportSearchResults.hidden = true;
    airportSearchInput.setAttribute("aria-expanded", "false");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const airport of results) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "airport-result";
    button.setAttribute("role", "option");
    button.dataset.lat = String(airport.lat);
    button.dataset.lon = String(airport.lon);
    button.dataset.ident = airport.ident || "";
    button.dataset.label = `${airport.ident || airport.iata || "AIRPORT"} - ${airport.name || "Airport"}`;
    const context = airportContextLabel(airport);
    button.innerHTML = `<strong>${escapeHtml(airport.ident || airport.iata || "----")} - ${escapeHtml(airport.name || "Airport")}</strong><span>${escapeHtml(context || airport.type || "")}</span>`;
    fragment.appendChild(button);
  }
  airportSearchResults.appendChild(fragment);
  airportSearchResults.hidden = false;
  airportSearchInput.setAttribute("aria-expanded", "true");
}

async function updateAirportSearchResults() {
  if (!airportSearchInput) return;
  const query = airportSearchInput.value.trim();
  if (!query || query.length < 2) {
    renderAirportSearchResults([]);
    return;
  }
  const rows = await loadNationwideAirportSearchRows();
  const ranked = rows
    .map((airport) => ({ airport, score: scoreAirportSearchResult(airport, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.airport.ident).localeCompare(String(b.airport.ident)))
    .slice(0, 12)
    .map((entry) => entry.airport);
  renderAirportSearchResults(ranked);
}

function setAirportSearchLabel(label) {
  selectedAirportLabel = label || selectedAirportLabel;
  if (airportSearchLabel) airportSearchLabel.textContent = selectedAirportLabel;
  if (airportSearchInput && document.activeElement !== airportSearchInput) {
    airportSearchInput.value = selectedAirportLabel;
  }
}

function openAirportSearchModal() {
  if (!airportSearchModal || !airportSearchInput) return;
  airportSearchModal.hidden = false;
  shell.classList.add("airport-search-open");
  airportSearchInput.value = selectedAirportLabel === "Use GPS location" || selectedAirportLabel === "Custom coordinates" ? "" : selectedAirportLabel;
  renderAirportSearchResults([]);
  window.setTimeout(() => {
    airportSearchInput.focus();
    airportSearchInput.select();
  }, 80);
}

function closeAirportSearchModal() {
  if (!airportSearchModal) return;
  airportSearchModal.hidden = true;
  shell.classList.remove("airport-search-open");
  renderAirportSearchResults([]);
  setAirportSearchLabel(selectedAirportLabel);
}

async function loadLocalRunwayRows() {
  const persisted = storageReadJson("ADSB_RADAR_RUNWAY_ROWS", []);
  const bundledPayload = await loadBundledAirportSeed();
  const bundledRows = normalizeBundledRunwayRows(bundledPayload);
  const rows = [...(persisted || []), ...bundledRows];
  offlineAirportDataActive = offlineAirportDataActive || rows.length > 0;
  return rows;
}

function refreshAirportCacheInBackground() {
  if (airportRefreshInFlight || Date.now() < airportCacheRetryAt) return;
  airportRefreshInFlight = true;
  fetchTextWithTimeout(airportsCsvUrl, { timeoutMs: 4500, accept: "text/csv,*/*" })
    .then(parseAirportsCsv)
    .then((rows) => {
      if (!rows.length) throw new Error("Airport refresh returned no usable rows");
      airportRowsCache = rows;
      airportRowsCacheTileKey = "online";
      airportsCachePromise = Promise.resolve(rows);
      storageWriteJson("ADSB_RADAR_AIRPORT_ROWS", rows);
      offlineAirportDataActive = false;
    })
    .catch((error) => {
      console.warn("Unable to refresh airport data; keeping local airport database", error);
      airportCacheRetryAt = Date.now() + 300000;
    })
    .finally(() => {
      airportRefreshInFlight = false;
    });
}

function refreshRunwayCacheInBackground() {
  if (runwayRefreshInFlight || Date.now() < runwayCacheRetryAt) return;
  runwayRefreshInFlight = true;
  fetchTextWithTimeout(runwaysCsvUrl, { timeoutMs: 4500, accept: "text/csv,*/*" })
    .then(parseRunwaysCsv)
    .then((rows) => {
      if (!rows.length) throw new Error("Runway refresh returned no usable rows");
      runwayRowsCache = rows;
      runwaysCachePromise = Promise.resolve(rows);
      storageWriteJson("ADSB_RADAR_RUNWAY_ROWS", rows);
    })
    .catch((error) => {
      console.warn("Unable to refresh runway data; keeping local runway database", error);
      runwayCacheRetryAt = Date.now() + 300000;
    })
    .finally(() => {
      runwayRefreshInFlight = false;
    });
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
    runways: (runwaysByAirport.get(airport.ident) || airport.runways || [])
      .sort((a, b) => (b.lengthFt || 0) - (a.lengthFt || 0))
      .slice(0, 12)
  }));
}

async function loadNearbyAirportContext() {
  const [airportResult, runwayResult] = await Promise.allSettled([loadAirportCache(), loadRunwayCache()]);
  const airportRows = airportResult.status === "fulfilled" ? airportResult.value : [];
  const runwayRows = runwayResult.status === "fulfilled" ? runwayResult.value : [];
  if (airportResult.status === "rejected") {
    console.warn("Unable to load local airport database", airportResult.reason);
  }
  if (runwayResult.status === "rejected") {
    console.warn("Unable to load local runway database", runwayResult.reason);
  }

  const airportContextMiles = radiusMiles * 1.7;
  return pruneLargeRangeAirports(
    attachRunwaysToAirports(airportRows, runwayRows)
    .map((airport) => ({
      ...airport,
      distanceMiles: milesBetween(center.lat, center.lon, airport.lat, airport.lon)
    }))
    .filter((airport) => airport.distanceMiles <= airportContextMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 120)
  );
}

function refreshNearbyAirportContext() {
  const requestId = ++airportContextRequestId;
  loadNearbyAirportContext().then((airportMatches) => {
    if (requestId !== airportContextRequestId) return;
    airports = airportMatches;
    renderList();
    scheduleRender();
  });
}

async function fetchStaticTraffic() {
  const trafficData = await fetchPreferredAircraftFeed();
  const snapshotId = trafficData.upstreamSnapshotId || trafficData.responseSnapshotId || "";
  const snapshotHash = trafficData.upstreamSnapshotHash || trafficData.responseSnapshotHash || "";
  const aircraftRows = dropDuplicateTisbOtherTargets(
    (trafficData.aircraft || trafficData.ac || [])
      .map(normalizeAircraft)
      .filter(Boolean)
      .map((plane) => ({
        ...plane,
        upstreamSnapshotId: plane.upstreamSnapshotId || snapshotId,
        upstreamSnapshotHash: plane.upstreamSnapshotHash || snapshotHash
      }))
  );
  applyNativeDeviceHeading(trafficData);
  applyStratusHeading(trafficData);
  if ((trafficData.displaySource === "Stratus" || trafficData.source === "Stratus") && !trafficData.stale) {
    ensureStratusTrackUp();
  }
  applyStratusOwnship(trafficData);
  refreshNearbyAirportContext();

  return {
    ...trafficData,
    aircraft: aircraftRows,
    airports,
    source: trafficData.displaySource || trafficData.source || "Internet ADS-B",
    stale: Boolean(trafficData.stale),
    ageSeconds: trafficData.ageSeconds ?? 0,
    warning: trafficData.warning || ""
  };
}

function applyStratusOwnship(trafficData) {
  if (trafficData.displaySource !== "Stratus" && trafficData.source !== "Stratus") return;
  if (trafficData.stale || !gpsModeSelected()) return;

  const ownship = normalizeOwnship(trafficData.ownship);
  if (!ownship) {
    stratusTrackDegrees = null;
    stratusTrackSpeedKts = 0;
    return;
  }
  ensureStratusTrackUp();

  const now = Date.now();
  const movedMiles = milesBetween(center.lat, center.lon, ownship.lat, ownship.lon);
  const previousCenter = { ...center };
  const shouldRefresh = movedMiles > 0.05 || !lastFetchAt;

  gpsActive = true;
  stratusOwnshipActive = true;
  lastStratusOwnshipAt = now;
  stratusTrackSpeedKts = Number.isFinite(Number(ownship.speed)) ? Number(ownship.speed) : 0;
  gpsSpeedKts = stratusTrackSpeedKts;
  gpsAltitudeFt =
    Number.isFinite(Number(ownship.geoAltitude))
      ? Number(ownship.geoAltitude)
      : Number.isFinite(Number(ownship.altitude))
        ? Number(ownship.altitude)
        : null;
  if (Number.isFinite(Number(ownship.track))) {
    stratusTrackDegrees = normalizedDegrees(Number(ownship.track));
  } else if (movedMiles > 0.003) {
    stratusTrackDegrees = bearingDegrees(previousCenter.lat, previousCenter.lon, ownship.lat, ownship.lon);
  }

  latInput.value = ownship.lat.toFixed(4);
  lonInput.value = ownship.lon.toFixed(4);
  center = { lat: ownship.lat, lon: ownship.lon };
  resetWeatherImageIfMoved(previousCenter, center);

  if (!lastGpsTrailAt || now - lastGpsTrailAt >= 30000) {
    gpsTrail.push({ lat: ownship.lat, lon: ownship.lon, at: now });
    gpsTrail = gpsTrail.slice(-120);
    lastGpsTrailAt = now;
  }

  if (shouldRefresh) {
    tracks.clear();
    radarBlips.clear();
    trafficTargetStates.clear();
    previousSweepAngle = null;
    previousRadarSweepBearing = null;
    previousWxTrafficSweepBearing = null;
    lastAirspaceKey = "";
    fetchAirspace();
  }
}

async function fetchAircraftFeed(baseUrl, { displaySource, timeoutMs = 6500 } = {}) {
  if (!baseUrl) throw new Error("Aircraft source is not configured");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestRadiusMiles = radiusMiles <= 15 ? closeRangeNearestTargetMiles : radiusMiles;
  const debugAircraft = trafficDebugEnabled
    ? aircraft.find((plane) => isTrackedAircraft(plane) || aircraftKey(plane) === proximityAlertKey)
    : null;
  const debugHex = String(debugAircraft?.hex || "").trim().toLowerCase();
  const debugQuery = debugHex ? `&debugHex=${encodeURIComponent(debugHex)}` : "";
  const aircraftUrl = `${baseUrl}/api/aircraft?lat=${center.lat}&lon=${center.lon}&radiusMiles=${requestRadiusMiles}${debugQuery}`;
  const sourceIsInternet = !isLocalNetworkUrl(baseUrl) && !String(displaySource || "").toLowerCase().includes("stratus");
  const requestStartedAt = Date.now();
  if (sourceIsInternet) {
    trafficPipelineDiagnostics.internetLastRequestStartedAt = requestStartedAt;
    trafficPipelineDiagnostics.internetLastSourceUrl = aircraftUrl;
    pushDiagnosticTimestamp(trafficPipelineDiagnostics.internetRequestTimestamps, requestStartedAt);
  }

  try {
    const response = await fetch(aircraftUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });
    const data = await response.json().catch(() => ({}));
    const completedAt = Date.now();
    if (sourceIsInternet) {
      trafficPipelineDiagnostics.internetLastRequestCompletedAt = completedAt;
      trafficPipelineDiagnostics.internetLastRequestDurationMs = completedAt - requestStartedAt;
      trafficPipelineDiagnostics.internetLastHttpStatus = response.status;
      trafficPipelineDiagnostics.internetLastDataAgeSeconds = data.dataAgeSeconds ?? null;
      trafficPipelineDiagnostics.internetLastNextRefreshEligibleSeconds = data.nextRefreshEligibleInSeconds ?? null;
      trafficPipelineDiagnostics.internetLastTargetCount = Number(data.total ?? data.aircraft?.length ?? data.ac?.length ?? 0);
      trafficPipelineDiagnostics.internetLastProvider = data.provider || data.source || displaySource || "Internet ADS-B";
      trafficPipelineDiagnostics.internetLastSnapshotId = data.upstreamSnapshotId || data.responseSnapshotId || "";
      trafficPipelineDiagnostics.internetLastSnapshotHash = data.upstreamSnapshotHash || data.responseSnapshotHash || "";
      trafficPipelineDiagnostics.internetLastCacheSource = data.cacheSource || "";
      trafficPipelineDiagnostics.internetLastUpstreamFetchedAt = data.upstreamFetchedAt || null;
      trafficPipelineDiagnostics.internetLastDataTimestamp = data.dataTimestamp || null;
    }
    if (!response.ok) {
      if (sourceIsInternet) {
        trafficPipelineDiagnostics.internetLastError = data.error || data.detail || data.warning || `HTTP ${response.status}`;
      }
      throw new Error(data.error || data.detail || `${displaySource || "aircraft source"} returned ${response.status}`);
    }
    if (sourceIsInternet) {
      trafficPipelineDiagnostics.internetLastSuccessAt = completedAt;
      trafficPipelineDiagnostics.internetLastError = "";
      pushDiagnosticTimestamp(trafficPipelineDiagnostics.internetSuccessTimestamps, completedAt);
    }
    return {
      ...data,
      providerSource: data.source,
      displaySource: data.displaySource || displaySource
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchNativeStratusFeed({ timeoutMs = 900 } = {}) {
  if (!nativeStratusHandler) throw new Error("Native Stratus bridge is not available");

  const requestId = `${Date.now()}-${++nativeStratusRequestId}`;
  const requestRadiusMiles = radiusMiles <= 15 ? closeRangeNearestTargetMiles : radiusMiles;
  trafficPipelineDiagnostics.lastNativeRequestAt = Date.now();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("adsb-native-stratus-response", handleResponse);
      reject(new Error("Native Stratus bridge timed out"));
    }, timeoutMs);

    function handleResponse(event) {
      const detail = event.detail || {};
      if (detail.id !== requestId || detail.type !== "aircraft") return;

      window.clearTimeout(timeout);
      window.removeEventListener("adsb-native-stratus-response", handleResponse);

      if (detail.error) {
        reject(new Error(detail.error));
        return;
      }

      trafficPipelineDiagnostics.lastNativeWebResponseAt = Date.now();
      trafficPipelineDiagnostics.lastNativePayloadGeneratedAt =
        Number(detail.payload?.nativePayloadGeneratedAt || 0) * 1000 || trafficPipelineDiagnostics.lastNativePayloadGeneratedAt;
      trafficPipelineDiagnostics.jsPayloadsReceived += 1;
      pushDiagnosticTimestamp(trafficPipelineDiagnostics.jsPayloadTimestamps, trafficPipelineDiagnostics.lastNativeWebResponseAt);
      trafficPipelineDiagnostics.lastBridgeState = String(detail.payload?.receiverState || "received");
      resolve({
        ...(detail.payload || {}),
        displaySource: "Stratus"
      });
    }

    window.addEventListener("adsb-native-stratus-response", handleResponse);
    nativeStratusHandler.postMessage({
      id: requestId,
      type: "aircraft",
      lat: center.lat,
      lon: center.lon,
      radiusMiles: requestRadiusMiles
    });
  });
}

async function fetchPreferredAircraftFeed() {
  trafficPipelineDiagnostics.lastInternetPollingActive = Boolean(adsbProxyBaseUrl);

  if (nativeStratusHandler) {
    try {
      const nativeData = await fetchNativeStratusFeed({ timeoutMs: 1500 });
      applyNativeDeviceHeading(nativeData);
      trafficPipelineDiagnostics.lastStratusPacketAgeSeconds = Number.isFinite(Number(nativeData.lastUdpReceiveAgeSeconds))
        ? Number(nativeData.lastUdpReceiveAgeSeconds)
        : Number.isFinite(Number(nativeData.ageSeconds))
          ? Number(nativeData.ageSeconds)
          : null;
      trafficPipelineDiagnostics.lastStratusActive = !nativeData.stale;
      if (nativeData.stale) {
        const age = Number.isFinite(Number(nativeData.ageSeconds)) ? `${Math.round(Number(nativeData.ageSeconds))}s old` : "not receiving packets";
        selectTrafficSourceDiagnostics({ source: "internet", reason: `native Stratus stale (${age}); trying Internet ADS-B` });
        throw new Error(`Native Stratus receiver is stale (${age})`);
      }
      selectTrafficSourceDiagnostics({ source: "stratus", reason: "native Stratus live packets" });
      return nativeData;
    } catch (error) {
      trafficPipelineDiagnostics.lastStratusActive = false;
      console.warn("Native Stratus traffic source unavailable; falling back to cellular/configured sources", error);
    }
  }

  if (stratusBridgeBaseUrl) {
    try {
      const stratusData = await fetchAircraftFeed(stratusBridgeBaseUrl, {
        displaySource: "Stratus",
        timeoutMs: 1600
      });
      if (stratusData.stale) {
        const age = Number.isFinite(Number(stratusData.ageSeconds)) ? `${Math.round(Number(stratusData.ageSeconds))}s old` : "not receiving packets";
        selectTrafficSourceDiagnostics({ source: "internet", reason: `HTTP Stratus bridge stale (${age}); trying Internet ADS-B` });
        throw new Error(`Stratus bridge is stale (${age})`);
      }
      fetchStratusAuxiliaryData();
      trafficPipelineDiagnostics.lastStratusActive = true;
      selectTrafficSourceDiagnostics({ source: "stratus", reason: "HTTP Stratus bridge live" });
      return stratusData;
    } catch (error) {
      trafficPipelineDiagnostics.lastStratusActive = false;
      console.warn("Stratus traffic source unavailable; falling back to cellular source", error);
    }
  }

  if (!adsbProxyBaseUrl) {
    selectTrafficSourceDiagnostics({ source: "none", reason: "Internet ADS-B proxy is not configured" });
    throw new Error("Cloudflare Worker proxy is not configured");
  }

  try {
    const internetData = await fetchAircraftFeed(adsbProxyBaseUrl, {
      displaySource: internetTrafficSourceLabel(),
      timeoutMs: 6500
    });
    const sourceInfo = classifyTrafficSource(internetData);
    selectTrafficSourceDiagnostics({
      source: sourceInfo.type,
      reason: internetData.stale
        ? `${sourceInfo.label} cached/stale snapshot (${internetData.dataAgeSeconds ?? internetData.ageSeconds ?? "--"}s old)`
        : `${sourceInfo.label} live response (${internetData.total ?? internetData.aircraft?.length ?? 0} targets)`
    });
    return internetData;
  } catch (error) {
    selectTrafficSourceDiagnostics({ source: "none", reason: `Internet ADS-B unavailable: ${error.message}` });
    throw error;
  }
}

async function fetchStratusJson(path, timeoutMs = 1200) {
  if (!stratusBridgeBaseUrl) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${stratusBridgeBaseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function fetchStratusAuxiliaryData() {
  Promise.all([fetchStratusJson("/api/weather"), fetchStratusJson("/api/ahrs")]).then(([weather, ahrs]) => {
    if (weather) stratusWeatherData = weather;
    if (ahrs) {
      stratusAhrsData = ahrs;
      applyStratusHeading(ahrs);
    }
  });
}

function airspaceEnvelope() {
  const latPad = radiusMiles / 69 + 0.08;
  const lonPad = radiusMiles / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180))) + 0.08;
  return `${center.lon - lonPad},${center.lat - latPad},${center.lon + lonPad},${center.lat + latPad}`;
}

function offlineTileIdFor(lat, lon, tileDegrees = 4) {
  const latBase = Math.floor(Number(lat) / tileDegrees) * tileDegrees;
  const lonBase = Math.floor(Number(lon) / tileDegrees) * tileDegrees;
  const ns = latBase >= 0 ? "n" : "s";
  const ew = lonBase >= 0 ? "e" : "w";
  return `${ns}${String(Math.abs(latBase)).padStart(2, "0")}${ew}${String(Math.abs(lonBase)).padStart(3, "0")}`;
}

function offlineTileIdsForView(multiplier = 1.8) {
  const tileDegrees = 4;
  const radius = Math.max(25, radiusMiles * multiplier);
  const latPad = radius / 69;
  const lonPad = radius / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const ids = [];
  const latStart = Math.floor((center.lat - latPad) / tileDegrees) * tileDegrees;
  const latEnd = Math.floor((center.lat + latPad) / tileDegrees) * tileDegrees;
  const lonStart = Math.floor((center.lon - lonPad) / tileDegrees) * tileDegrees;
  const lonEnd = Math.floor((center.lon + lonPad) / tileDegrees) * tileDegrees;
  for (let lat = latStart; lat <= latEnd; lat += tileDegrees) {
    for (let lon = lonStart; lon <= lonEnd; lon += tileDegrees) {
      ids.push(offlineTileIdFor(lat, lon, tileDegrees));
    }
  }
  return [...new Set(ids)];
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

  return tiles.slice(0, performanceModeConfig().tileLimit);
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

  const response = await fetchWithTimeout(weatherMapsUrl, { timeoutMs: 2500 });
  if (!response.ok) throw new Error(`weather radar returned ${response.status}`);
  weatherMeta = await response.json();
  weatherMetaFetchedAt = now;
  return weatherMeta;
}

async function ensureWeatherImage() {
  if (scratchpadPaused) return;
  if (!showPrecipitation || weatherImageLoading) return;
  if (Date.now() < weatherImageRetryAt) return;

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
      if (loadedTiles.length) {
        weatherTiles = loadedTiles;
      } else if (!weatherTiles.length) {
        weatherImageRetryAt = Date.now() + 15000;
      }
    }
    weatherImageLoading = false;
  } catch (error) {
    weatherImageLoading = false;
    weatherImageRetryAt = Date.now() + 15000;
    console.warn("Unable to load precipitation layer", error);
  }
}

function drawPrecipitation(scope) {
  if (!showPrecipitation) return;
  const now = Date.now();
  if (!weatherTiles.length || now - lastWeatherEnsureAt > 60000) {
    lastWeatherEnsureAt = now;
    ensureWeatherImage();
  }
  if (!weatherTiles.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.58;
  for (const tile of weatherTiles) {
    drawProjectedWeatherTile(tile, scope);
  }
  ctx.restore();
}

function drawProjectedWeatherTile(tile, scope) {
  const steps = performanceMode === "cool" ? 2 : reducedLoad ? 3 : 5;
  const sourceWidth = tile.image.naturalWidth || tile.image.width;
  const sourceHeight = tile.image.naturalHeight || tile.image.height;
  if (!sourceWidth || !sourceHeight) return;

  for (let row = 0; row < steps; row += 1) {
    for (let col = 0; col < steps; col += 1) {
      const u0 = col / steps;
      const v0 = row / steps;
      const u1 = (col + 1) / steps;
      const v1 = (row + 1) / steps;
      const nw = weatherTileToLatLon(tile.x + u0, tile.y + v0, tile.zoom);
      const ne = weatherTileToLatLon(tile.x + u1, tile.y + v0, tile.zoom);
      const sw = weatherTileToLatLon(tile.x + u0, tile.y + v1, tile.zoom);
      const se = weatherTileToLatLon(tile.x + u1, tile.y + v1, tile.zoom);
      const p00 = project(nw.lat, nw.lon, scope);
      const p10 = project(ne.lat, ne.lon, scope);
      const p01 = project(sw.lat, sw.lon, scope);
      const p11 = project(se.lat, se.lon, scope);
      const margin = 30;
      const outside =
        [p00, p10, p01, p11].every(
          (point) =>
            point.x < -margin ||
            point.x > scope.width + margin ||
            point.y < -margin ||
            point.y > scope.height + margin ||
            point.distance > radiusMiles * 1.35
        );
      if (outside) continue;

      const sx = u0 * sourceWidth;
      const sy = v0 * sourceHeight;
      const swidth = (u1 - u0) * sourceWidth;
      const sheight = (v1 - v0) * sourceHeight;
      if (swidth <= 0 || sheight <= 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.clip();
      ctx.translate(p00.x, p00.y);
      ctx.transform((p10.x - p00.x) / swidth, (p10.y - p00.y) / swidth, (p01.x - p00.x) / sheight, (p01.y - p00.y) / sheight, 0, 0);
      ctx.drawImage(tile.image, sx, sy, swidth, sheight, 0, 0, swidth, sheight);
      ctx.restore();
    }
  }
}

function updateCenter(lat, lon, { clearTracks = true, source = "manual" } = {}) {
  center = { lat, lon };
  latInput.value = lat.toFixed(4);
  lonInput.value = lon.toFixed(4);
  if (clearTracks) {
    tracks.clear();
    radarBlips.clear();
    trafficTargetStates.clear();
    previousSweepAngle = null;
    previousRadarSweepBearing = null;
    previousWxTrafficSweepBearing = null;
  }
  lastAirspaceKey = "";
  resetWeatherImage();
  setStatusText(
    source === "gps"
      ? `GPS center active at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.`
      : "Radar sweep active. Updating aircraft every pass."
  );
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

function normalizeSpecialUseClass(attributes) {
  const classText = String(attributes.CLASS || "").toUpperCase();
  const typeText = String(attributes.TYPE_CODE || "").toUpperCase();
  const nameText = String(attributes.NAME || "").toUpperCase();
  const combined = `${classText} ${typeText} ${nameText}`;

  if (classText === "P" || combined.includes("PROHIB")) return "P";
  if (classText === "R" || combined.includes("RESTRICT")) return "R";
  if (classText === "MOA" || combined.includes("MOA") || combined.includes("MILITARY OPERATIONS")) return "MOA";
  if (classText === "W" || typeText === "W" || combined.includes("WARNING")) return "W";
  if (classText === "A" || typeText === "A" || combined.includes("ALERT")) return "A";
  return "";
}

function normalizeSpecialUseAirspaceFeature(feature) {
  const attributes = feature.attributes || {};
  const specialUseType = normalizeSpecialUseClass(attributes);
  const rings = (feature.geometry?.rings || []).map((ring) => ring.map(([lon, lat]) => ({ lat, lon })));
  if (!specialUseType || !rings.length) return null;

  return {
    id: `SUA-${attributes.OBJECTID}`,
    ident: attributes.IDENT || "",
    name: attributes.NAME || "",
    classCode: "SUA",
    type: "SUA",
    typeCode: specialUseType,
    sector: attributes.SECTOR || "",
    lower: formatAirspaceAltitude(attributes.LOWER_VAL, attributes.LOWER_CODE),
    upper: formatAirspaceAltitude(attributes.UPPER_VAL, attributes.UPPER_CODE),
    controllingFacility: attributes.CONT_AGENT || attributes.COMM_NAME || "",
    rings
  };
}

function airspaceMatchesSelection(airspace, visibleClasses) {
  return visibleClasses.has(airspace.classCode);
}

function pointIsInsideRing(lat, lon, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    const crossesLatitude = currentPoint.lat > lat !== previousPoint.lat > lat;
    const crossingLongitude =
      ((previousPoint.lon - currentPoint.lon) * (lat - currentPoint.lat)) /
        (previousPoint.lat - currentPoint.lat || Number.EPSILON) +
      currentPoint.lon;
    if (crossesLatitude && lon < crossingLongitude) inside = !inside;
  }
  return inside;
}

function airportIsInsideControlledAirspace(airport) {
  const cacheKey = `${airport.ident || airport.iata || "?"}:${Number(airport.lat).toFixed(5)}:${Number(airport.lon).toFixed(5)}`;
  const cached = airportControlledAirspaceCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const isControlled = airspaces.some(
    (airspace) =>
      ["B", "C", "D"].includes(airspace.classCode) &&
      airspace.lower === "SFC" &&
      airspace.rings.some((ring) => ring.length >= 3 && pointIsInsideRing(airport.lat, airport.lon, ring))
  );
  airportControlledAirspaceCache.set(cacheKey, isControlled);
  return isControlled;
}

function airportShouldBeVisible(airport) {
  return showSmallAirports || airportIsInsideControlledAirspace(airport);
}

const airspaceCachePrefix = "ADSB_RADAR_AIRSPACE_";
const recentAirspaceCacheKey = "ADSB_RADAR_AIRSPACE_RECENT";

function airspaceStorageKey(key) {
  return `${airspaceCachePrefix}${key}`;
}

function parseAirspaceCacheKey(storageKey) {
  if (!storageKey.startsWith(airspaceCachePrefix)) return null;
  const key = storageKey.slice(airspaceCachePrefix.length);
  if (!key.startsWith("smooth2:") && !key.startsWith("smooth3:")) return null;
  const [, coords = "", classes = ""] = key.split(":");
  const [latText, lonText, radiusText] = coords.split(",");
  const lat = Number(latText);
  const lon = Number(lonText);
  const radius = Number(radiusText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius)) return null;
  return { key, lat, lon, radius, classes };
}

function loadCachedAirspace(key) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(airspaceStorageKey(key)) || "null");
    return Array.isArray(cached) ? cached : null;
  } catch {
    return null;
  }
}

function saveCachedAirspace(key, rows) {
  try {
    window.localStorage.setItem(airspaceStorageKey(key), JSON.stringify(rows.slice(0, 160)));
    window.localStorage.setItem(recentAirspaceCacheKey, key);
  } catch {
    // Storage may be unavailable or full; keep the live session copy.
  }
}

function loadNearestCachedAirspace(key) {
  const exact = loadCachedAirspace(key);
  if (exact?.length) return { key, rows: exact };

  try {
    const requested = parseAirspaceCacheKey(airspaceStorageKey(key));
    if (!requested) return null;

    const candidates = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      const parsed = storageKey ? parseAirspaceCacheKey(storageKey) : null;
      if (!parsed) continue;
      const distance = milesBetween(requested.lat, requested.lon, parsed.lat, parsed.lon);
      if (distance <= Math.max(35, requested.radius * 2.5, parsed.radius * 2.5)) {
        candidates.push({ ...parsed, distance });
      }
    }

    const recentKey = window.localStorage.getItem(recentAirspaceCacheKey);
    candidates.sort((a, b) => {
      if (a.key === recentKey) return -1;
      if (b.key === recentKey) return 1;
      if (a.radius === requested.radius && b.radius !== requested.radius) return -1;
      if (b.radius === requested.radius && a.radius !== requested.radius) return 1;
      if (a.classes === requested.classes && b.classes !== requested.classes) return -1;
      if (b.classes === requested.classes && a.classes !== requested.classes) return 1;
      return a.distance - b.distance;
    });

    for (const candidate of candidates) {
      const rows = loadCachedAirspace(candidate.key);
      if (rows?.length) return { key: candidate.key, rows };
    }
  } catch {
    // Best-effort offline fallback only.
  }

  return null;
}

function circleRing(lat, lon, radiusNm, segments = 48) {
  const radiusMilesValue = radiusNm * 1.15078;
  const earthMiles = 3958.7613;
  const latRad = (lat * Math.PI) / 180;
  const angularDistance = radiusMilesValue / earthMiles;
  const ring = [];

  for (let index = 0; index <= segments; index += 1) {
    const bearing = (index / segments) * Math.PI * 2;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLon =
      (lon * Math.PI) / 180 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
      );
    ring.push({ lat: (pointLat * 180) / Math.PI, lon: (pointLon * 180) / Math.PI });
  }

  return ring;
}

function normalizeBundledAirspaceRows(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.airspaces;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((airspace) => {
      const rings = Array.isArray(airspace.rings)
        ? airspace.rings
        : airspace.center && Number.isFinite(Number(airspace.radiusNm))
          ? [circleRing(Number(airspace.center.lat), Number(airspace.center.lon), Number(airspace.radiusNm))]
          : [];
      return {
        id: airspace.id || airspace.ident || airspace.name,
        ident: airspace.ident || "",
        name: airspace.name || "",
        classCode: airspace.classCode || airspace.class || "",
        sector: airspace.sector || "",
        type: airspace.type || "",
        typeCode: airspace.typeCode || "",
        controllingFacility: airspace.controllingFacility || "",
        usage: airspace.usage || null,
        lower: airspace.lower || "--",
        upper: airspace.upper || "--",
        bbox: Array.isArray(airspace.bbox) ? airspace.bbox : null,
        rings
      };
    })
    .filter((airspace) => airspace.classCode && airspace.rings.length);
}

async function loadBundledAirspaceRows() {
  if (!bundledAirspacePromise) {
    bundledAirspacePromise = fetchJsonWithTimeout(bundledAirspaceUrl, {
      timeoutMs: 1200,
      cache: "force-cache"
    })
      .then(normalizeBundledAirspaceRows)
      .catch((error) => {
        console.warn("Bundled airspace seed unavailable", error);
        return [];
      });
  }

  return bundledAirspacePromise;
}

async function loadBundledAirspaceTile(tileId, tileInfo) {
  if (!tileInfo?.file) return [];
  if (!bundledAirspaceTilePromises.has(tileId)) {
    bundledAirspaceTilePromises.set(
      tileId,
      fetchJsonWithTimeout(new URL(tileInfo.file, bundledTilesBaseUrl).href, {
        timeoutMs: 900,
        cache: "force-cache"
      })
        .then(normalizeBundledAirspaceRows)
        .catch((error) => {
          console.warn(`Bundled airspace tile ${tileId} unavailable`, error);
          return [];
        })
    );
  }
  return bundledAirspaceTilePromises.get(tileId);
}

async function loadBundledAirspaceTileRows() {
  const index = await loadBundledTileIndex();
  if (!index?.airspace) return [];
  const tileIds = offlineTileIdsForView(2.3);
  airspaceLastTileIds = tileIds.slice().sort();
  trafficPipelineDiagnostics.airspaceLoadedTileIds = airspaceLastTileIds;
  const rows = (await Promise.all(tileIds.map((tileId) => loadBundledAirspaceTile(tileId, index.airspace[tileId])))).flat();
  return Array.from(new Map(rows.map((airspace) => [airspace.id, airspace])).values());
}

function airspaceIntersectsCurrentView(airspace) {
  const maxDistance = Math.max(15, radiusMiles * 2.2);
  if (Array.isArray(airspace.bbox) && airspace.bbox.length === 4) {
    const [west, south, east, north] = airspace.bbox.map(Number);
    const latPad = maxDistance / 69;
    const lonPad = maxDistance / (69 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
    if (Number.isFinite(west) && Number.isFinite(south) && Number.isFinite(east) && Number.isFinite(north)) {
      const viewWest = center.lon - lonPad;
      const viewEast = center.lon + lonPad;
      const viewSouth = center.lat - latPad;
      const viewNorth = center.lat + latPad;
      return east >= viewWest && west <= viewEast && north >= viewSouth && south <= viewNorth;
    }
  }
  return airspace.rings.some((ring) =>
    ring.some((point) => milesBetween(center.lat, center.lon, point.lat, point.lon) <= maxDistance)
  );
}

async function loadLocalAirspaceFallback(visibleClasses) {
  const tiledRows = await loadBundledAirspaceTileRows();
  const candidateRows = tiledRows.length ? tiledRows : await loadBundledAirspaceRows();
  const rows = candidateRows
    .filter((airspace) => airspaceMatchesSelection(airspace, visibleClasses))
    .filter(airspaceIntersectsCurrentView)
    .slice(0, 220);
  if (rows.length) offlineAirspaceDataActive = true;
  return rows;
}

async function fetchAirspace() {
  const requiredClasses = getRequiredAirspaceClasses();
  if (!requiredClasses.size) {
    setAirspaces([], "airspace classes disabled");
    lastAirspaceKey = "";
    return;
  }

  const classKey = Array.from(requiredClasses).sort().join("");
  const key = `smooth3:${center.lat.toFixed(4)},${center.lon.toFixed(4)},${radiusMiles}:${classKey}`;
  if (key === lastAirspaceKey && airspaces.length) return;
  const cachedAirspace = loadNearestCachedAirspace(key);
  const cachedRows = (cachedAirspace?.rows || []).filter((airspace) => airspaceMatchesSelection(airspace, requiredClasses));
  const cachedClasses = new Set(cachedRows.map((airspace) => airspace.classCode));
  const cacheCoversSelection = Array.from(requiredClasses).every((classCode) => cachedClasses.has(classCode));
  if (cachedRows.length) {
    setAirspaces(cachedRows, "nearest cached airspace");
    lastAirspaceKey = key;
    offlineAirspaceDataActive = true;
  }

  if (!cacheCoversSelection) {
    const localAirspace = await loadLocalAirspaceFallback(requiredClasses);
    if (localAirspace.length) {
      const mergedAirspaces = new Map(cachedRows.map((airspace) => [airspace.id, airspace]));
      for (const airspace of localAirspace) mergedAirspaces.set(airspace.id, airspace);
      setAirspaces(Array.from(mergedAirspaces.values()), "offline airspace tiles");
      lastAirspaceKey = key;
      updateDataSourceIndicator(null);
    }
  }

  if (nativeStratusHandler && airspaces.length) {
    return;
  }

  const airspaceRequests = [];
  const classCodes = Array.from(requiredClasses).filter((classCode) => ["B", "C", "D"].includes(classCode));

  if (classCodes.length) {
    const classParams = new URLSearchParams({
      f: "json",
      where: `TYPE_CODE='CLASS' AND CLASS in (${classCodes.map((classCode) => `'${classCode}'`).join(",")})`,
      outFields: "OBJECTID,IDENT,ICAO_ID,NAME,CLASS,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,SECTOR",
      geometry: airspaceEnvelope(),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outSR: "4326",
      returnGeometry: "true",
      geometryPrecision: radiusMiles <= 20 ? "5" : "4",
      resultRecordCount: "120"
    });
    airspaceRequests.push(
      getJson(`${airspaceQueryUrl}?${classParams}`).then((data) =>
        (data.features || []).map(normalizeAirspaceFeature).filter(Boolean)
      )
    );
  }

  if (requiredClasses.has("SUA")) {
    const specialUseParams = new URLSearchParams({
      f: "json",
      where: "1=1",
      outFields:
        "OBJECTID,NAME,TYPE_CODE,CLASS,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,SECTOR,CONT_AGENT,COMM_NAME",
      geometry: airspaceEnvelope(),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outSR: "4326",
      returnGeometry: "true",
      geometryPrecision: radiusMiles <= 20 ? "5" : "4",
      resultRecordCount: "120"
    });
    airspaceRequests.push(
      getJson(`${specialUseAirspaceQueryUrl}?${specialUseParams}`).then((data) =>
        (data.features || []).map(normalizeSpecialUseAirspaceFeature).filter(Boolean)
      )
    );
  }

  try {
    const fetchedAirspaces = (await Promise.all(airspaceRequests)).flat();
    if (!fetchedAirspaces.length && airspaces.length) {
      console.warn("FAA airspace request returned no usable boundaries; keeping cached/session airspace.");
      lastAirspaceKey = key;
      return;
    }
    setAirspaces(fetchedAirspaces, "online FAA airspace refresh");
    lastAirspaceKey = key;
    offlineAirspaceDataActive = false;
    if (airspaces.length) saveCachedAirspace(key, airspaces);
  } catch (error) {
    console.warn("Unable to fetch FAA airspace boundaries", error);
  }
}

async function fetchTraffic({ force = false } = {}) {
  if (trafficFetchInFlight) return;
  if (!force && Date.now() < nextTrafficFetchAt) return;

  trafficFetchInFlight = true;
  trafficPipelineDiagnostics.lastFetchStartedAt = Date.now();

  try {
    const data = await fetchStaticTraffic();
    const receivedAt = Date.now();
    const sourceInfo = classifyTrafficSource(data);
    const incomingAircraft = data.aircraft.map((plane) => ({ ...plane, positionReceivedAt: receivedAt }));
    await enrichAircraftIdentities(incomingAircraft);
    const keepLastGoodLocalWifiTraffic =
      data.stale &&
      sourceInfo.type === "wifi" &&
      aircraft.length > 0 &&
      incomingAircraft.length === 0;

    if (!keepLastGoodLocalWifiTraffic) {
      aircraft = incomingAircraft;
      ingestTrafficPositions(aircraft, receivedAt, {
        sourceType: sourceInfo.type,
        snapshotId: data.upstreamSnapshotId || data.responseSnapshotId || "",
        responseMetadata: {
          provider: data.provider || data.providerSource || data.source || "",
          cacheSource: data.cacheSource || "",
          upstreamFetchedAt: data.upstreamFetchedAt || null,
          dataTimestamp: data.dataTimestamp || null,
          dataAgeSeconds: data.dataAgeSeconds ?? null,
          cacheAgeSeconds: data.cacheAgeSeconds ?? null
        }
      });
      trafficPipelineDiagnostics.lastJsTrafficStateUpdateAt = receivedAt;
      if (sourceInfo.type === "internet" || sourceInfo.type === "faa") {
        trafficPipelineDiagnostics.internetLastStoreMutationAt = receivedAt;
      }
    }
    trafficPipelineDiagnostics.lastFetchCompletedAt = receivedAt;
    airports = data.airports;
    lastDataSource = data.source;
    updateStratusDiagnostics(data);
    updateDataSourceIndicator(data);
    logTrafficPipelineDiagnostics(data, data.stale ? "stale" : "sample");
    if (data.stale) {
      const age = Number.isFinite(Number(data.ageSeconds)) ? `${Math.round(Number(data.ageSeconds))}s old` : "stale";
      setStatusText(`${lastDataSource} receiver waiting. Last packet ${age}. ${data.staleReason || ""}`.trim());
    } else if (String(data.receiverState || "").toLowerCase() === "degraded") {
      setStatusText(`${lastDataSource} receiver degraded. ${data.staleReason || "Packet cadence is slower than expected."}`);
    } else {
      setStatusText(
        gpsActive
          ? `${lastDataSource} traffic active. GPS center at ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.${offlineDataNotice()}`
          : aircraft.length
            ? `${lastDataSource} traffic active for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.${offlineDataNotice()}`
            : `${lastDataSource} traffic returned no aircraft for ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}.${offlineDataNotice()}`
      );
    }
    if (!keepLastGoodLocalWifiTraffic) {
      updateTrackedAircraftHistory(aircraft);
      resolveMissingAircraftTypes(aircraft);
      pruneRadarBlips(aircraft);
    }
    lastFetchAt = receivedAt;
    scheduleNextTrafficFetch({ source: data.source, stale: data.stale });
    scheduleRender();
  } catch (error) {
    lastDataSource = "offline";
    updateStratusDiagnostics(null);
    updateDataSourceIndicator(null);
    selectTrafficSourceDiagnostics({ source: "none", reason: `traffic fetch failed: ${error.message}` });
    refreshNearbyAirportContext();
    scheduleNextTrafficFetch({ failed: true });
    const retrySeconds = Math.max(1, Math.round((nextTrafficFetchAt - Date.now()) / 1000));
    const keepDataHint = aircraft.length ? " Keeping last radar picture." : offlineDataNotice();
    setStatusText(`ADS-B feed unavailable: ${error.message}. Retrying in ${retrySeconds}s.${keepDataHint}`);
  } finally {
    trafficFetchInFlight = false;
  }

  renderList();
  updateProximityAlert();
}

function pumpTrafficFeed() {
  if (!running) return;
  if (Date.now() < nextTrafficFetchAt) return;
  fetchTraffic();
}

function startTrafficPump() {
  if (trafficPumpTimer) return;
  trafficPumpTimer = window.setInterval(pumpTrafficFeed, 250);
}

function renderList({ force = false } = {}) {
  if (!force && shell.classList.contains("panel-collapsed")) return;

  lastUpdateEl.textContent = lastFetchAt
    ? new Date(lastFetchAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "No sweep yet";

  const sorted = displayAircraft()
    .map((plane) => ({
      ...plane,
      distance: milesBetween(center.lat, center.lon, plane.lat, plane.lon)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);

  aircraftListEl.innerHTML = sorted
    .map(
      (plane) => {
        const key = aircraftKey(plane);
        const trackIdentifier = trafficTrackIdentifier(plane);
        return `
        <li>
          <div class="aircraft-row" data-aircraft-key="${escapeHtml(key)}">
            <button type="button" class="aircraft-summary" data-aircraft-key="${escapeHtml(key)}">
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
            <div class="aircraft-actions">
              <button type="button" class="aircraft-action" data-action="show" data-aircraft-key="${escapeHtml(key)}">SHOW</button>
              <button type="button" class="aircraft-action" data-action="track" data-aircraft-key="${escapeHtml(key)}" ${trackIdentifier ? "" : "disabled"}>TRACK</button>
            </div>
          </div>
        </li>
      `;
      }
    )
    .join("");
}

function drawGrid(scope) {
  const theme = currentRadarTheme();
  ctx.save();
  ctx.translate(scope.cx, scope.cy);
  ctx.strokeStyle = theme.grid;
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

  ctx.strokeStyle = theme.boundary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, scope.radius, 0, Math.PI * 2);
  ctx.stroke();

  drawHeadingTicks(scope);

  ctx.fillStyle = theme.cardinalText;
  ctx.font = "850 16px ui-monospace, SFMono-Regular, Consolas, monospace";
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
  const theme = currentRadarTheme();
  ctx.save();
  ctx.strokeStyle = theme.headingTicks;
  ctx.fillStyle = theme.headingText;
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
      ctx.font = "850 14px ui-monospace, SFMono-Regular, Consolas, monospace";
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
    if (!airportShouldBeVisible(airport)) continue;
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

function airspaceLayerKey(scope, visibleClasses) {
  const rotationBucket = Math.round(radarRotationDegrees() * 2) / 2;
  return [
    airspaceDatasetVersion,
    Array.from(visibleClasses).sort().join(""),
    center.lat.toFixed(4),
    center.lon.toFixed(4),
    radiusMiles,
    Math.round(scope.width),
    Math.round(scope.height),
    Math.round(scope.radius),
    rotationBucket
  ].join("|");
}

function airspaceLabelAnchorKey(airspace) {
  const ringLengths = airspace.rings.map((ring) => ring.length).join(",");
  const bbox = Array.isArray(airspace.bbox) ? airspace.bbox.map((value) => Number(value).toFixed(4)).join(",") : "";
  return `${airspace.id}|${airspace.lower}|${airspace.upper}|${bbox}|${ringLengths}`;
}

function airspaceGeometryCenter(airspace) {
  if (Array.isArray(airspace.bbox) && airspace.bbox.length === 4) {
    const [west, south, east, north] = airspace.bbox.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      return { lat: (south + north) / 2, lon: (west + east) / 2 };
    }
  }

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  for (const ring of airspace.rings) {
    for (const point of ring) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      latSum += point.lat;
      lonSum += point.lon;
      count += 1;
    }
  }
  return count ? { lat: latSum / count, lon: lonSum / count } : null;
}

function stableAirspaceLabelAnchor(airspace) {
  const key = airspaceLabelAnchorKey(airspace);
  const cached = airspaceLabelAnchorCache.get(key);
  if (cached) return cached;

  const centerPoint = airspaceGeometryCenter(airspace);
  if (!centerPoint) return null;
  let bestPoint = null;
  let bestScore = Infinity;

  airspace.rings.forEach((ring, ringIndex) => {
    ring.forEach((point, pointIndex) => {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
      const score =
        Math.abs(point.lat - centerPoint.lat) +
        Math.abs(point.lon - centerPoint.lon) * Math.max(0.25, Math.cos((centerPoint.lat * Math.PI) / 180)) +
        ringIndex * 0.00001 +
        pointIndex * 0.0000001;
      if (score < bestScore) {
        bestScore = score;
        bestPoint = { lat: point.lat, lon: point.lon };
      }
    });
  });

  const anchor = bestPoint || centerPoint;
  airspaceLabelAnchorCache.set(key, anchor);
  return anchor;
}

function buildProjectedAirspaceLayer(scope, visibleClasses, styles) {
  const layoutStartedAt = Date.now();
  const projectedFeatures = [];
  const labelBoxes = [];

  for (const airspace of airspaces) {
    if (!airspaceMatchesSelection(airspace, visibleClasses)) continue;
    const style = styles[airspace.classCode] || styles.D;
    const rings = [];

    for (const ring of airspace.rings) {
      if (ring.length < 2) continue;
      const projectedRing = ring.map((point) => project(point.lat, point.lon, scope));
      rings.push(projectedRing);
    }

    let label = null;
    const anchor = stableAirspaceLabelAnchor(airspace);
    if (showRadarData && anchor) {
      const labelPoint = project(anchor.lat, anchor.lon, scope);
      if (labelPoint.distance <= radiusMiles * 1.15) {
        const airspaceLabel = airspace.classCode === "SUA" ? airspace.typeCode || "SUA" : airspace.classCode;
        const text = `${airspaceLabel} ${airspace.lower}/${airspace.upper}`;
        const x = Math.min(scope.width - 76, Math.max(8, labelPoint.x + 5));
        const y = Math.min(scope.height - 12, Math.max(18, labelPoint.y - 5));
        const box = textBox(x, y, text, 14);
        const collidesWithAirspaceLabel = labelBoxes.some(
          (existing) =>
            box.x < existing.x + existing.width &&
            box.x + box.width > existing.x &&
            box.y < existing.y + existing.height &&
            box.y + box.height > existing.y
        );
        if (!collidesWithAirspaceLabel) {
          labelBoxes.push(box);
          label = { text, x, y };
        }
      }
    }

    projectedFeatures.push({
      id: airspace.id,
      classCode: airspace.classCode,
      style,
      rings,
      label
    });
  }

  pushDiagnosticTimestamp(trafficPipelineDiagnostics.airspaceLayoutRecalculationTimestamps, layoutStartedAt);
  trafficPipelineDiagnostics.airspaceLabelLayoutRecalculationsPerMinute = Number(
    (diagnosticRate(trafficPipelineDiagnostics.airspaceLayoutRecalculationTimestamps) * 60).toFixed(1)
  );
  return projectedFeatures;
}

function projectedAirspaceLayer(scope, visibleClasses, styles) {
  const key = airspaceLayerKey(scope, visibleClasses);
  if (airspaceLayerCache?.key === key) return airspaceLayerCache.features;
  const features = buildProjectedAirspaceLayer(scope, visibleClasses, styles);
  airspaceLayerCache = { key, features };
  return features;
}

function drawAirspace(scope) {
  const visibleClasses = getVisibleAirspaceClasses();
  if (!visibleClasses.size || !airspaces.length) return;

  const styles = {
    B: { stroke: "rgba(87, 185, 255, 0.92)", fill: "rgba(87, 185, 255, 0.06)", dash: [] },
    C: { stroke: "rgba(255, 88, 232, 0.82)", fill: "rgba(255, 88, 232, 0.045)", dash: [] },
    D: { stroke: "rgba(35, 96, 202, 0.92)", fill: "rgba(35, 96, 202, 0.045)", dash: [10, 13] },
    SUA: { stroke: "rgba(255, 176, 60, 0.86)", fill: "rgba(255, 176, 60, 0.035)", dash: [14, 8, 3, 8] }
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const projectedFeatures = projectedAirspaceLayer(scope, visibleClasses, styles);
  pushDiagnosticTimestamp(trafficPipelineDiagnostics.airspaceDrawTimestamps, Date.now());
  trafficPipelineDiagnostics.airspaceRedrawsPerMinute = Number(
    (diagnosticRate(trafficPipelineDiagnostics.airspaceDrawTimestamps) * 60).toFixed(1)
  );

  for (const feature of projectedFeatures) {
    const style = feature.style;
    ctx.strokeStyle = style.stroke;
    ctx.fillStyle = style.fill;
    ctx.setLineDash(style.dash);
    ctx.lineDashOffset = 0;

    for (const projectedRing of feature.rings) {
      drawAirspaceRingPath(projectedRing);
      ctx.fill();
      ctx.stroke();
    }

    if (feature.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = style.stroke;
      ctx.fillText(feature.label.text, feature.label.x, feature.label.y);
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

  // Airspace boundaries must honor FAA vertices exactly. The offline data is
  // already granular enough for arcs; canvas smoothing would round legal corners.
  cleanPoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function drawTrack(scope, plane, alpha = 1) {
  const key = plane.hex || plane.nNumber || plane.callsign;
  const history = (tracks.get(key) || [])
    .slice(-breadcrumbLimitForAircraft(plane))
    .filter((sample) => milesBetween(center.lat, center.lon, sample.lat, sample.lon) <= radiusMiles);
  if (plane.predicted && history.length) {
    const last = history.at(-1);
    const predictedMoved = Math.abs(last.lat - plane.lat) > 0.00001 || Math.abs(last.lon - plane.lon) > 0.00001;
    if (predictedMoved && milesBetween(center.lat, center.lon, plane.lat, plane.lon) <= radiusMiles) {
      history.push({ lat: plane.lat, lon: plane.lon, at: Date.now(), predicted: true });
    }
  }
  if (history.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = alpha;
  const tracked = isTrackedAircraft(plane);
  ctx.strokeStyle = tracked
    ? lightTheme
      ? "rgba(198, 76, 0, 0.94)"
      : "rgba(255, 157, 53, 0.9)"
    : altitudeColorStyle(plane).trail;
  ctx.lineWidth = tracked ? 2.4 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(tracked ? [1.5, 5] : [1.2, 4.5]);
  ctx.beginPath();

  history.forEach((sample, index) => {
    const point = project(sample.lat, sample.lon, scope);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawAircraftContact({ plane, point, alpha, highlight, compactLabel }) {
  const theme = currentRadarTheme();
  const highlightMix = highlight?.highlightMix || 0;
  const tracked = isTrackedAircraft(plane);
  const track = finiteMotionValue(plane.track);
  const hasTrack = track !== null;
  const screenAngle = trafficSymbolScreenAngleDegrees(track, radarRotationDegrees());
  const heading = screenAngle === null ? 0 : (screenAngle * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(point.x, point.y);
  if (hasTrack) ctx.rotate(heading);
  ctx.scale(highlight?.scale || 1, highlight?.scale || 1);
  if (tracked) {
    ctx.save();
    ctx.strokeStyle = trackedAircraftColor(0.96);
    ctx.lineWidth = 2.4;
    ctx.shadowColor = trackedAircraftColor(0.68);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const targetColor =
    plane.emergency && plane.emergency !== "none"
      ? platformColors.red
      : highlightMix > 0
        ? `rgba(${platformColors.redRgb}, ${isAndroidWeb ? 0.62 + highlightMix * 0.38 : 0.42 + highlightMix * 0.58})`
        : altitudeColorStyle(plane).target;
  ctx.fillStyle = targetColor;
  ctx.shadowColor = lightTheme && targetColor === theme.lowTarget ? "rgba(255, 255, 255, 0.98)" : targetColor;
  ctx.shadowBlur = lightTheme && targetColor === theme.lowTarget ? 10 : 8;
  ctx.beginPath();
  if (hasTrack) {
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 5);
    ctx.closePath();
  } else {
    // Unknown TAIS motion is intentionally nondirectional rather than a false north heading.
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.aircraftText;
  if (showRadarData) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillText(compactLabel ? aircraftCompactLabel(plane) : aircraftDisplayLabel(plane), point.x + 13, point.y - 11);
    if (!compactLabel) {
      ctx.fillStyle = theme.aircraftData;
      ctx.fillText(`${formatAltitude(plane.altitude)} ${formatSpeed(plane.speed)}`, point.x + 13, point.y + 4);
    }
    ctx.restore();
  }
}

function drawVerticalTrendCue(plane, point, alpha = 1) {
  const theme = currentRadarTheme();
  const verticalRate = Number(plane.verticalRate);
  if (!Number.isFinite(verticalRate)) return;

  const climbing = verticalRate > 500;
  const descending = verticalRate < -500;
  if (!climbing && !descending) return;

  const ownAltitude = Number(gpsAltitudeFt);
  const targetAltitude = Number(plane.altitude);
  const movingTowardOwnAltitude =
    Number.isFinite(ownAltitude) &&
    Number.isFinite(targetAltitude) &&
    ((targetAltitude > ownAltitude && descending) || (targetAltitude < ownAltitude && climbing));
  const x = point.x - 16;
  const y = point.y + 6;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0.25, alpha));
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = movingTowardOwnAltitude ? theme.verticalTrendConflict : theme.verticalTrendSafe;
  ctx.fillStyle = ctx.strokeStyle;

  const tipOffset = climbing ? -8 : 8;
  const tailOffset = climbing ? 8 : -8;
  const headBaseOffset = climbing ? -3 : 3;
  ctx.beginPath();
  ctx.moveTo(x, y + tailOffset);
  ctx.lineTo(x, y + tipOffset);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + tipOffset);
  ctx.lineTo(x - 3.5, y + headBaseOffset);
  ctx.lineTo(x + 3.5, y + headBaseOffset);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function collectAircraftContacts(scope, now) {
  const normalContacts = [];
  const highlightedContacts = [];
  const seenKeys = new Set();

  for (const plane of visibleRadarAircraft()) {
    const displayPlane = predictedAircraftForDisplay(plane, now);
    const key = aircraftKey(displayPlane);
    seenKeys.add(key);

    const point = project(displayPlane.lat, displayPlane.lon, scope);
    if (point.distance > radiusMiles) continue;

    const alpha = radarBlipAlpha(plane, now);
    if (alpha <= 0) continue;

    const highlight = aircraftHighlightState(key, now);
    const contact = { plane: displayPlane, point, alpha, highlight };
    if (highlight?.active) highlightedContacts.push(contact);
    else normalContacts.push(contact);
  }

  for (const plane of displayAircraft()) {
    if (!shouldPredictAircraft(plane)) continue;
    const key = aircraftKey(plane);
    if (seenKeys.has(key)) continue;

    const displayPlane = predictedAircraftForDisplay(plane, now);
    const point = project(displayPlane.lat, displayPlane.lon, scope);
    if (point.distance > radiusMiles) continue;

    const highlight = aircraftHighlightState(key, now);
    const contact = { plane: displayPlane, point, alpha: 1, highlight };
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

function drawTrackedAircraftGuide(scope) {
  const plane = findTrackedAircraft();
  if (!plane) return;
  const stroke = lightTheme ? "rgba(38, 26, 136, 0.9)" : trackedAircraftColor(0.78);
  const shadow = lightTheme ? "rgba(20, 16, 92, 0.28)" : trackedAircraftColor(0.5);
  drawGuideToAircraft(scope, predictedAircraftForDisplay(plane), stroke, shadow);
}

function drawThreatFocusGuide(scope) {
  if (!trafficAlertActive || !proximityAlertKey) return;
  const plane = visibleAircraft().find((candidate) => aircraftKey(candidate) === proximityAlertKey);
  if (!plane) return;
  const stroke = lightTheme ? "rgba(102, 16, 132, 0.9)" : "rgba(255, 235, 80, 0.82)";
  const shadow = lightTheme ? "rgba(52, 12, 84, 0.3)" : "rgba(255, 80, 92, 0.42)";
  drawGuideToAircraft(scope, predictedAircraftForDisplay(plane), stroke, shadow);
}

function drawGuideToAircraft(scope, plane, strokeStyle, shadowColor) {
  const point = project(plane.lat, plane.lon, scope);
  if (point.distance > radiusMiles) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(scope.cx, scope.cy);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
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

  drawTrackedAircraftGuide(scope);
  drawThreatFocusGuide(scope);
  for (const contact of normalContacts) {
    drawAircraftContact(contact);
    drawVerticalTrendCue(contact.plane, contact.point, contact.alpha);
  }
  for (const contact of highlightedContacts) {
    drawAircraftContact(contact);
    drawVerticalTrendCue(contact.plane, contact.point, contact.alpha);
  }

  ctx.restore();
}

function drawUserNavigation(scope) {
  if (!gpsActive) return;
  const theme = currentRadarTheme();

  const visibleTrail = gpsTrail.filter((sample) => Date.now() - sample.at <= 30 * 60 * 1000);
  gpsTrail = visibleTrail;

  ctx.save();
  ctx.beginPath();
  ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
  ctx.clip();

  if (visibleTrail.length >= 2) {
    ctx.strokeStyle = theme.navTrail;
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

  if (!weatherMode) {
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
  }

  if (gpsSpeedKts >= 2 && Number.isFinite(gpsTrackDegrees)) {
    const projected = destinationPoint(center.lat, center.lon, gpsTrackDegrees, (gpsSpeedKts / 3600) * 30 * 1.15078);
    const projectedPoint = project(projected.lat, projected.lon, scope);
    ctx.strokeStyle = theme.navProjection;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(scope.cx, scope.cy);
    ctx.lineTo(projectedPoint.x, projectedPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(projectedPoint.x, projectedPoint.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = theme.navProjection;
    ctx.fill();
  }

  ctx.restore();
}

function drawArcOwnship(scope) {
  if (!weatherMode) return;

  ctx.save();
  ctx.translate(scope.cx, scope.cy);
  ctx.strokeStyle = "rgba(233, 255, 243, 0.92)";
  ctx.fillStyle = "rgba(3, 8, 5, 0.88)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, 28);
  ctx.lineTo(0, 20);
  ctx.lineTo(14, 28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 232, 150, 0.98)";
  ctx.fill();
  ctx.restore();
}

function drawSweep(scope, angle) {
  const trailSegments = performanceMode === "cool" ? 7 : reducedLoad ? 12 : 28;
  const trailWidth = performanceMode === "cool" ? 0.64 : reducedLoad ? 0.9 : 1.35;
  const palette = sweepPalettes[sweepColor] || sweepPalettes.green;
  ctx.save();
  ctx.translate(scope.cx, scope.cy);

  for (let index = 0; index < trailSegments; index += 1) {
    const progress = index / trailSegments;
    const segmentAngle = angle - progress * trailWidth;
    const alpha = (1 - progress) ** 2 * (performanceMode === "cool" ? 0.1 : reducedLoad ? 0.14 : 0.2);
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

function drawWeatherScopeBackground(scope) {
  const theme = currentRadarTheme();
  if (!theme.scopeBackground) return;

  ctx.save();
  weatherSectorPath(scope);
  ctx.fillStyle = theme.scopeBackground;
  ctx.fill();
  ctx.restore();
}

function rawWeatherForwardBearing() {
  if (arcHeadingOverrideActive()) return arcHeadingOverrideDegrees;
  const activeHeading = activeTrackHeadingDegrees();
  if (Number.isFinite(activeHeading)) return activeHeading;
  if (Number.isFinite(gpsTrackDegrees) && gpsSpeedKts >= gpsTrackThresholdKts) return gpsTrackDegrees;
  if (Number.isFinite(compassHeadingDegrees)) return compassHeadingDegrees;
  return 0;
}

function updateArcForwardHeading(now = performance.now()) {
  if (arcHeadingOverrideActive()) {
    arcForwardHeadingDegrees = arcHeadingOverrideDegrees;
    lastArcForwardHeadingAt = now;
    return;
  }
  const rawHeading = rawWeatherForwardBearing();
  if (!Number.isFinite(rawHeading)) return;
  if (!Number.isFinite(arcForwardHeadingDegrees)) {
    arcForwardHeadingDegrees = normalizedDegrees(rawHeading);
    lastArcForwardHeadingAt = now;
    return;
  }

  const elapsedSeconds = Math.max(0.016, Math.min(0.25, (now - lastArcForwardHeadingAt) / 1000));
  const delta = ((normalizedDegrees(rawHeading - arcForwardHeadingDegrees + 180) - 180) || 0);
  const absDelta = Math.abs(delta);
  const maxDegreesPerSecond = absDelta > 45 ? 220 : absDelta > 15 ? 140 : 72;
  const maxStep = maxDegreesPerSecond * elapsedSeconds;
  const step = Math.max(-maxStep, Math.min(maxStep, delta));
  arcForwardHeadingDegrees = normalizedDegrees(arcForwardHeadingDegrees + step);
  lastArcForwardHeadingAt = now;
}

function weatherForwardBearing() {
  if (Number.isFinite(arcForwardHeadingDegrees)) return arcForwardHeadingDegrees;
  return rawWeatherForwardBearing();
}

function weatherSectorSweepBearing(progress) {
  const triangle = progress < 0.5 ? progress * 4 - 1 : 3 - progress * 4;
  return normalizedDegrees(weatherForwardBearing() + triangle * wxSectorDegrees);
}

function formatHeading(value) {
  const heading = Math.round(normalizedDegrees(value || 0));
  return String(heading === 360 ? 0 : heading).padStart(3, "0");
}

function drawWeatherHeadingTape(scope) {
  const theme = currentRadarTheme();
  const heading = weatherForwardBearing();
  const centerX = scope.cx;
  const topY = 82;
  const lineY = 116;
  const spacing = Math.max(34, Math.min(52, scope.width / 16));
  const leftX = Math.max(24, centerX - spacing * 6.5);
  const rightX = Math.min(scope.width - 24, centerX + spacing * 6.5);

  ctx.save();
  ctx.strokeStyle = theme.arcHeadingTape;
  ctx.fillStyle = theme.arcHeadingTape;
  ctx.lineWidth = 1.4;
  ctx.font = "850 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.beginPath();
  ctx.moveTo(leftX, lineY);
  ctx.lineTo(rightX, lineY);
  ctx.stroke();

  const baseHeading = Math.floor(heading / 10) * 10;
  for (let index = -8; index <= 8; index += 1) {
    const tapeHeading = baseHeading + index * 10;
    const offset = normalizedDegrees(tapeHeading - heading);
    const signedOffset = offset > 180 ? offset - 360 : offset;
    const x = centerX + (signedOffset / 10) * spacing;
    if (x < leftX || x > rightX) continue;

    ctx.beginPath();
    ctx.moveTo(x, lineY - 14);
    ctx.lineTo(x, lineY - 2);
    ctx.stroke();
    ctx.fillText(formatHeading(tapeHeading), x, lineY + 14);
  }

  const boxWidth = 64;
  const boxHeight = 28;
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = theme.arcHeadingBox;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(centerX - boxWidth / 2, topY, boxWidth, boxHeight);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.arcHeadingBox;
  ctx.font = "950 17px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.fillText(formatHeading(heading), centerX, topY + boxHeight / 2 + 1);
  ctx.restore();
}

function drawWeatherSector(scope, sweepBearing, sweepProgress) {
  const theme = currentRadarTheme();
  const { left: leftAngle, right: rightAngle } = weatherSectorAngles();
  const sweepAngle = screenAngleForBearing(sweepBearing);
  const palette = sweepPalettes[sweepColor] || sweepPalettes.green;

  ctx.save();
  ctx.translate(scope.cx, scope.cy);

  ctx.strokeStyle = theme.arcPrimary;
  ctx.lineWidth = 2;
  for (const angle of [leftAngle, rightAngle]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * scope.radius, Math.sin(angle) * scope.radius);
    ctx.stroke();
  }

  ctx.strokeStyle = theme.arcSecondary;
  ctx.setLineDash([2, 10]);
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, scope.radius * fraction, leftAngle, rightAngle, false);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = theme.arcPrimary;
  ctx.fillStyle = theme.arcText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "850 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  const tickStep = performanceMode === "cool" ? 15 : reducedLoad ? 10 : 5;
  for (let offset = -wxSectorDegrees; offset <= wxSectorDegrees; offset += tickStep) {
    const angle = screenAngleForBearing(weatherForwardBearing() + offset);
    const labeled = offset % 10 === 0;
    const inner = scope.radius - (labeled ? 15 : 8);
    const outer = scope.radius;
    ctx.lineWidth = labeled ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();

    if (labeled) {
      const labelRadius = scope.radius + 18;
      const label = offset === 0 ? "0" : `${Math.abs(offset)}`;
      ctx.fillText(label, Math.cos(angle) * labelRadius, Math.sin(angle) * labelRadius);
    }
  }

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
  ctx.fillStyle = theme.arcText;
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const value of labelValues) {
    const radius = (value / radiusMiles) * scope.radius;
    const x = Math.cos(rightAngle) * radius + 8;
    const y = Math.sin(rightAngle) * radius;
    ctx.fillText(`${value}`, x, y);
  }

  const trailDirection = sweepProgress < 0.5 ? -1 : 1;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, scope.radius, leftAngle, rightAngle, false);
  ctx.closePath();
  ctx.clip();
  const trailSegments = performanceMode === "cool" ? 6 : reducedLoad ? 10 : 22;
  for (let index = 0; index < trailSegments; index += 1) {
    const progress = index / Math.max(1, trailSegments - 2);
    const segmentAngle = sweepAngle + trailDirection * progress * 0.52;
    const alpha = (1 - progress) ** 2 * (performanceMode === "cool" ? 0.11 : reducedLoad ? 0.16 : 0.24);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, scope.radius, segmentAngle - 0.02, segmentAngle + 0.02);
    ctx.closePath();
    ctx.fillStyle = `rgba(${palette.trail}, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();

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
  const theme = currentRadarTheme();
  ctx.save();
  ctx.fillStyle = theme.hud;
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${visibleRadarAircraft().length} TRACKS`, 22, 28);
  ctx.fillText(`${airports.length} AIRPORTS`, 22, 48);
  ctx.restore();
}

function scheduleRender() {
  if (scratchpadPaused || renderLoopScheduled) return;
  renderLoopScheduled = true;
  requestAnimationFrame(render);
}

function setScratchpadPaused(paused) {
  scratchpadPaused = Boolean(paused);
  if (scratchpadPaused) {
    renderLoopScheduled = false;
    if (performanceTelemetry) {
      performanceTelemetry.dataset.notice = "Radar rendering paused while the ATC pad is open; traffic alert monitoring remains active.";
    }
    updatePerformanceTelemetry();
    return;
  }

  if (performanceTelemetry?.dataset.notice?.includes("ATC pad")) {
    delete performanceTelemetry.dataset.notice;
  }
  lastRenderedAt = 0;
  nextTrafficFetchAt = 0;
  scheduleRender();
}

function render(now) {
  renderLoopScheduled = false;
  if (scratchpadPaused) return;
  trafficPipelineDiagnostics.lastRenderTimerAliveAt = Date.now();

  const targetFrameMs = 1000 / performanceModeConfig().fps;
  if (targetFrameMs && lastRenderedAt && now - lastRenderedAt < targetFrameMs) {
    scheduleRender();
    return;
  }
  lastRenderedAt = now;
  const frameStartedAt = performance.now();
  maybeRefreshDeviceStatus();
  if (trafficDebugEnabled) updateTrafficDebugOverlay();

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scope = weatherMode ? weatherScope(width, height) : radarScope(width, height);

  const sweepProgress = ((now / 1000) % sweepSeconds) / sweepSeconds;
  const sweepBucket = Math.floor(now / (sweepSeconds * 1000));
  const angle = sweepProgress * Math.PI * 2 - Math.PI / 2;
  const radarSweepBearing = sweepProgress * 360;
  const wxProgress = ((now / 1000) % wxSweepSeconds) / wxSweepSeconds;
  const wxSweepBucket = Math.floor(now / (wxSweepSeconds * 1000));
  if (weatherMode) updateArcForwardHeading(now);
  else arcForwardHeadingDegrees = null;
  const wxSweepBearing = weatherSectorSweepBearing(wxProgress);
  const wxAngle = screenAngleForBearing(wxSweepBearing);

  if (running && !weatherMode) {
    if (sweepBucket !== lastSweepBucket) {
      lastSweepBucket = sweepBucket;
      sweepSequence += 1;
      playSweepTick();
    }
    if (Number.isFinite(previousRadarSweepBearing)) {
      processTrafficSweepPresentation(previousRadarSweepBearing, radarSweepBearing, {
        mode: "radar",
        sweepPassId: `radar:${sweepBucket}`,
        direction: "clockwise"
      });
    }
    previousRadarSweepBearing = radarSweepBearing;
    previousWxTrafficSweepBearing = null;
  }

  if (running && weatherMode) {
    if (wxSweepBucket !== lastWxSweepBucket) {
      lastWxSweepBucket = wxSweepBucket;
      sweepSequence += 1;
      playSweepTick();
    }
    const wxDirection = wxProgress < 0.5 ? "clockwise" : "counterclockwise";
    const wxLeg = wxProgress < 0.5 ? "outbound" : "return";
    if (Number.isFinite(previousWxTrafficSweepBearing)) {
      processTrafficSweepPresentation(previousWxTrafficSweepBearing, wxSweepBearing, {
        mode: "wx",
        sweepPassId: `wx:${wxSweepBucket}:${wxLeg}`,
        direction: wxDirection
      });
    }
    previousWxTrafficSweepBearing = wxSweepBearing;
    previousRadarSweepBearing = null;
  }

  ctx.clearRect(0, 0, width, height);
  const theme = currentRadarTheme();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  if (!weatherMode && theme.scopeBackground) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(scope.cx, scope.cy, scope.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = theme.scopeBackground;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  pruneExpiredRadarBlips();
  if (weatherMode) updateRadarBlipsForWeatherSweep(wxAngle);
  else updateRadarBlipsForSweep(angle);
  prepareAircraftLabels(scope, Date.now());
  trafficPipelineDiagnostics.lastRadarTrafficRenderAt = Date.now();
  trafficPipelineDiagnostics.lastTrafficRenderCount = currentAircraftContacts.length;
  if (weatherMode) {
    drawWeatherScopeBackground(scope);
    withWeatherSectorClip(scope, () => {
      drawPrecipitation(scope);
      drawAirspace(scope);
      drawAirports(scope);
      drawAircraft(scope);
      drawUserNavigation(scope);
    });
    drawWeatherSector(scope, wxSweepBearing, wxProgress);
    drawWeatherHeadingTape(scope);
    drawArcOwnship(scope);
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
  updateTrackedAircraftAlert();
  updateWxNearestTarget();
  updateArcHeadingOverrideControl();
  recordRenderStats(frameStartedAt, now);

  scheduleRender();
}

function setRange(nextRange) {
  radiusMiles = allowedRanges.includes(nextRange) ? nextRange : 20;
  resetWeatherImage();
  updateBottomRangeButton();
}

function updateRangeIndicator() {
  if (rangeIndicator) rangeIndicator.textContent = `RNG ${radiusMiles} NM`;
}

function stepRadarRange(direction) {
  const currentIndex = allowedRanges.indexOf(radiusMiles);
  const safeIndex = currentIndex >= 0 ? currentIndex : allowedRanges.indexOf(10);
  const nextIndex = clamp(safeIndex + direction, 0, allowedRanges.length - 1);
  const nextRange = allowedRanges[nextIndex];
  if (nextRange === radiusMiles) return;
  setRange(nextRange);
  trafficPipelineDiagnostics.lastRangeChangeAt = Date.now();
  trafficPipelineDiagnostics.lastRangeChangeValue = nextRange;
  console.info("Traffic pipeline range-change marker", {
    rangeMiles: nextRange,
    nextTrafficFetchInSeconds: ((nextTrafficFetchAt - Date.now()) / 1000).toFixed(2),
    inFlight: trafficFetchInFlight
  });
  fetchAirspace();
  fetchTraffic({ force: true });
}

function installRadarRangePinch() {
  if (!radarWrap) return;
  let pinchStartDistance = 0;
  let pinchLastRange = radiusMiles;

  const touchDistance = (touches) => {
    if (!touches || touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  radarWrap.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2) return;
      pinchStartDistance = touchDistance(event.touches);
      pinchLastRange = radiusMiles;
      event.preventDefault();
    },
    { passive: false }
  );

  radarWrap.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 2 || !pinchStartDistance) return;
      event.preventDefault();
      const distance = touchDistance(event.touches);
      if (!distance) return;
      const ratio = distance / pinchStartDistance;
      if (ratio > 1.18 && radiusMiles === pinchLastRange) {
        stepRadarRange(-1);
        pinchLastRange = radiusMiles;
        pinchStartDistance = distance;
      } else if (ratio < 0.84 && radiusMiles === pinchLastRange) {
        stepRadarRange(1);
        pinchLastRange = radiusMiles;
        pinchStartDistance = distance;
      }
    },
    { passive: false }
  );

  radarWrap.addEventListener("touchend", () => {
    pinchStartDistance = 0;
  });
}

function rangeForDistance(distance) {
  return allowedRanges.find((range) => distance <= range) || allowedRanges[allowedRanges.length - 1];
}

function zoomToAircraftIfNeeded(plane) {
  if (!plane) return;
  const distance = milesBetween(center.lat, center.lon, plane.lat, plane.lon);
  if (!Number.isFinite(distance) || distance <= radiusMiles) return;

  const nextRange = rangeForDistance(distance + 0.4);
  if (nextRange !== radiusMiles) {
    setRange(nextRange);
    fetchAirspace();
    fetchTraffic({ force: true });
  }
}

function updateBottomRangeButton() {
  updateRangeIndicator();
}

function setWeatherMode(enabled) {
  if (enabled && !weatherMode) {
    previousOrientationBeforeArc = orientationMode;
    setOrientationMode("track", { persist: false });
    if (!shell.classList.contains("panel-collapsed")) {
      shell.classList.add("panel-collapsed");
      updatePanelToggle();
      window.setTimeout(resizeCanvas, 240);
    }
  } else if (!enabled && weatherMode) {
    setOrientationMode(previousOrientationBeforeArc === "track" ? "track" : "north", { persist: false });
  }

  weatherMode = Boolean(enabled);
  if (!weatherMode) {
    arcHeadingOverrideDegrees = null;
    arcHeadingOverrideStartedAt = 0;
    arcHeadingOverrideUntil = 0;
  }
  shell.classList.toggle("wx-mode", weatherMode);
  if (radarModeToggle) {
    radarModeToggle.classList.toggle("active", weatherMode);
    radarModeToggle.textContent = weatherMode ? "360" : "ARC";
    radarModeToggle.setAttribute("aria-pressed", String(weatherMode));
    radarModeToggle.setAttribute("aria-label", weatherMode ? "Full circle radar mode" : "Forward radar mode");
  }
  updateBottomRangeButton();
  updateWxNearestTarget();
  updateArcHeadingOverrideControl();
  setQuickNotesVisible(weatherMode);
  previousSweepAngle = null;
  previousRadarSweepBearing = null;
  previousWxTrafficSweepBearing = null;
}

function setWxDisplayMode(mode, { persist = true } = {}) {
  wxDisplayMode = ["off", "on", "wxOnly"].includes(mode) ? mode : "off";
  showPrecipitation = wxDisplayMode !== "off";
  if (persist) window.localStorage.setItem("ADSB_RADAR_WX_DISPLAY_MODE", wxDisplayMode);

  if (wxToggle) {
    wxToggle.classList.toggle("active", wxDisplayMode === "on");
    wxToggle.classList.toggle("wx-only", wxDisplayMode === "wxOnly");
    wxToggle.setAttribute("aria-pressed", String(showPrecipitation));
    wxToggle.setAttribute(
      "aria-label",
      wxDisplayMode === "off"
        ? "Show precipitation layer"
        : wxDisplayMode === "on"
          ? "Show precipitation without normal traffic"
          : "Hide precipitation layer and restore traffic display"
    );
  }
  shell.classList.toggle("wx-traffic-hidden", wxDisplayMode === "wxOnly");
  if (showPrecipitation) ensureWeatherImage();
  renderList();
  updateWxNearestTarget();
}

function cycleWxDisplayMode() {
  const nextMode = wxDisplayMode === "off" ? "on" : wxDisplayMode === "on" ? "wxOnly" : "off";
  setWxDisplayMode(nextMode);
}

document.addEventListener(
  "gesturestart",
  (event) => {
    if (!event.target?.closest?.(".radar-wrap")) event.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  "gesturechange",
  (event) => {
    if (!event.target?.closest?.(".radar-wrap")) event.preventDefault();
  },
  { passive: false }
);

arcHeadingOverrideEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-heading]");
  if (!button) return;
  setArcHeadingOverride(Number(button.dataset.heading));
});

radarModeToggle?.addEventListener("click", () => {
  if (!weatherMode && !gpsModeSelected()) {
    window.alert("Unavailable without GPS location enabled");
    return;
  }
  if (!weatherMode) {
    previousRangeBeforeWx = radiusMiles;
  } else if (allowedRanges.includes(previousRangeBeforeWx)) {
    setRange(previousRangeBeforeWx);
  }
  setWeatherMode(!weatherMode);
  fetchTraffic({ force: true });
});

wxToggle?.addEventListener("click", () => {
  cycleWxDisplayMode();
});

wxNearestTarget?.addEventListener("click", focusNearestTargetFromArc);
wxNearestTarget?.addEventListener("pointerup", (event) => {
  event.preventDefault();
  focusNearestTargetFromArc();
});
wxNearestTarget?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  focusNearestTargetFromArc();
});

quickNotesCanvas?.addEventListener("pointerdown", beginQuickNote);
quickNotesCanvas?.addEventListener("pointermove", continueQuickNote);
quickNotesCanvas?.addEventListener("pointerup", endQuickNote);
quickNotesCanvas?.addEventListener("pointercancel", endQuickNote);
quickNotesCanvas?.addEventListener("contextmenu", (event) => event.preventDefault());
quickNotes?.addEventListener("selectstart", (event) => event.preventDefault());
quickNotes?.addEventListener("contextmenu", (event) => event.preventDefault());
quickNotes?.addEventListener("gesturestart", (event) => event.preventDefault());
quickNotes?.addEventListener("touchstart", (event) => {
  if (event.target.closest("#quickNotesClear")) return;
  if (event.target.closest("#quickNotesAtcPad")) return;
  event.preventDefault();
}, { passive: false });
quickNotes?.addEventListener("touchmove", (event) => {
  if (event.target.closest("#quickNotesClear")) return;
  if (event.target.closest("#quickNotesAtcPad")) return;
  event.preventDefault();
}, { passive: false });
quickNotesAtcPad?.addEventListener("click", openAtcScratchpad);
quickNotesAtcPad?.addEventListener("pointerdown", (event) => event.stopPropagation());
quickNotesClear?.addEventListener("pointerdown", beginQuickNotesClearHold);
quickNotesClear?.addEventListener("pointerup", finishQuickNotesClearHold);
quickNotesClear?.addEventListener("pointercancel", cancelQuickNotesClearHold);
quickNotesClear?.addEventListener("pointerleave", cancelQuickNotesClearHold);
quickNotesClear?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

altitudeBracketButton?.addEventListener("click", cycleAltitudeBracket);

airspaceToggles.addEventListener("change", () => {
  for (const input of airspaceToggles.querySelectorAll("input[data-class]")) {
    window.localStorage.setItem(`ADSB_RADAR_AIRSPACE_CLASS_${input.dataset.class}`, String(input.checked));
  }

  if (!getRequiredAirspaceClasses().size) {
    setAirspaces([], "airspace classes disabled");
    lastAirspaceKey = "";
    return;
  }

  fetchAirspace();
});

smallAirportsToggle?.addEventListener("change", () => {
  showSmallAirports = smallAirportsToggle.checked;
  window.localStorage.setItem(smallAirportsPreferenceKey, String(showSmallAirports));
  airportControlledAirspaceCache.clear();
  lastAirspaceKey = "";
  if (!showSmallAirports) fetchAirspace();
  scheduleRender();
});

function openSettings() {
  settingsModal.hidden = false;
  refreshDeviceThermalStatus();
  updatePerformanceTelemetry();
}

function closeSettings() {
  settingsModal.hidden = true;
}

function openLegend() {
  legendModal.hidden = false;
  refreshDeviceThermalStatus();
}

function closeLegend() {
  legendModal.hidden = true;
}

function updateTrackingControls() {
  shell.classList.toggle("tracking-active", Boolean(trackedAircraft));
  trackingOpen?.classList.toggle("active", Boolean(trackedAircraft));
  radarTrackingOpen?.classList.toggle("active", Boolean(trackedAircraft));
  if (trackingNNumberInput) trackingNNumberInput.value = trackedAircraft?.nNumber || "";
  if (trackingCriterionSelect) trackingCriterionSelect.value = trackedAircraft?.criterion || "distance";
  if (trackingValueInput) trackingValueInput.value = trackedAircraft?.value ?? "10";
  if (trackingIsolateToggle) trackingIsolateToggle.checked = Boolean(trackedAircraft?.isolate);
  updateTrackingStatus();
}

function openTracking() {
  updateTrackingControls();
  trackingModal.hidden = false;
  window.setTimeout(() => trackingNNumberInput?.focus(), 0);
}

function closeTracking() {
  trackingModal.hidden = true;
}

function hideTrackedAircraftAlert() {
  if (!trackingAlertEl) return;
  trackingAlertEl.hidden = true;
  trackingAlertEl.dataset.contentKey = "";
  trackingAlertEl.innerHTML = "";
}

function clearTrackedAircraft() {
  logTrackingClearState("before-clear");
  const previousTracking = trackedAircraft ? { ...trackedAircraft } : null;
  const trackedPlane = findTrackedAircraft();
  if (trackedPlane) aircraftHighlights.delete(aircraftKey(trackedPlane));
  preserveTrackedAircraftHistory(trackedAircraft, trackedPlane);
  trackedAircraft = null;
  suppressTrackingRestore();
  saveTrackedAircraft();
  hideTrackedAircraftAlert();
  updateTrackingControls();
  renderList();
  scheduleRender();
  logTrackingClearState("after-clear", { previousTracking });
  if (trafficDebugEnabled) {
    window.setTimeout(() => {
      if (trackedAircraft) logTrackingClearState("restored-after-clear", { previousTracking });
    }, 5000);
  }
}

function handleTrackedAircraftClear(event) {
  const clearButton = event.target.closest(".tracking-alert-clear");
  if (!clearButton) return false;
  event.preventDefault();
  event.stopPropagation();
  clearTrackedAircraft();
  return true;
}

function updateTrackingStatus(message = "") {
  if (!trackingStatus) return;
  if (message) {
    trackingStatus.textContent = message;
    return;
  }
  if (!trackedAircraft) {
    trackingStatus.textContent = "No aircraft selected.";
    return;
  }
  const units = trackedAircraft.criterion === "time" ? "minutes away" : "NM away";
  trackingStatus.textContent = `Tracking ${trackedAircraft.nNumber}; alert at ${trackedAircraft.value} ${units}${trackedAircraft.isolate ? "; other traffic hidden" : ""}.`;
}

function trackedAircraftMetrics(plane) {
  if (!plane) return null;
  const key = aircraftKey(plane);
  const state = trafficTargetStates.get(key);
  const displayPlane = predictedAircraftForDisplay(plane);
  const rawSpeed = finiteMotionValue(plane.speed);
  const confirmedSpeed = finiteMotionValue(
    state?.confirmedGroundSpeed ?? state?.derivedGroundSpeed ?? state?.pendingPlane?.speed
  );
  const distanceMiles = milesBetween(center.lat, center.lon, displayPlane.lat, displayPlane.lon);
  const distanceNm = milesToNauticalMiles(distanceMiles);
  const speedKts = Math.max(
    0,
    rawSpeed != null && rawSpeed > 1 ? rawSpeed : confirmedSpeed ?? rawSpeed ?? 0
  );
  const etaMinutes = speedKts > 1 ? (distanceNm / speedKts) * 60 : Infinity;
  return { distanceMiles, distanceNm, speedKts, etaMinutes };
}

function trackedAircraftColor(alpha = 1) {
  if (isAndroidWeb && !lightTheme) return `rgba(${platformColors.greenRgb}, ${alpha})`;
  return lightTheme ? `rgba(215, 28, 40, ${alpha})` : `rgba(${platformColors.greenRgb}, ${alpha})`;
}

function updateTrackedAircraftAlert() {
  if (!trackingAlertEl) return;
  if (trackedAircraft && trackedAircraftClearedUntil && Date.now() < trackedAircraftClearedUntil) {
    logTrackingClearState("blocked-restore-at-alert-refresh");
    trackedAircraft = null;
    saveTrackedAircraft();
  }
  const plane = findTrackedAircraft();

  if (!trackedAircraft || !plane) {
    hideTrackedAircraftAlert();
    updateTrackingStatus();
    return;
  }

  const metrics = trackedAircraftMetrics(plane);
  const thresholdMet =
    trackedAircraft.criterion === "time"
      ? metrics.etaMinutes <= trackedAircraft.value
      : metrics.distanceNm <= trackedAircraft.value;

  updateTrackingStatus(
    `${trackedAircraft.nNumber} acquired: ${metrics.distanceNm.toFixed(1)} NM, ${formatTrackedEta(metrics.etaMinutes)} at ${Math.round(metrics.speedKts)} kt.`
  );

  trackedAircraft.alerted = thresholdMet;
  trackingAlertEl.hidden = false;
  const contentKey = [
    trackedAircraft.nNumber,
    metrics.distanceNm.toFixed(1),
    formatTrackedEta(metrics.etaMinutes),
    Math.round(metrics.speedKts)
  ].join("|");
  if (trackingAlertEl.dataset.contentKey === contentKey) return;
  trackingAlertEl.dataset.contentKey = contentKey;
  trackingAlertEl.innerHTML = `
    <span class="tracking-alert-content">
      <strong>${escapeHtml(trackedAircraft.nNumber)}</strong>
      ${metrics.distanceNm.toFixed(1)} NM
      ${formatTrackedEta(metrics.etaMinutes)}
      ${Math.round(metrics.speedKts)} KT
    </span>
    <button type="button" class="tracking-alert-clear" aria-label="Clear tracked aircraft">CLEAR</button>
  `;
}

function openAircraftDetails(plane) {
  if (!plane) return;
  const distance = milesBetween(center.lat, center.lon, plane.lat, plane.lon);
  const friendlyType = friendlyAircraftType(plane) || aircraftType(plane) || "Aircraft type unavailable";
  const registration = plane.registration || plane.nNumber || "";
  const callsign = usefulAircraftCallsign(plane);
  const rawType = String(plane.rawAircraftType || plane.type || "").trim();
  const icaoHex = normalizeIcaoHex(plane.hex || plane.icao);
  const primaryIdentity = callsign || registration || (icaoHex ? `ICAO ${icaoHex}` : planeLabel(plane));
  const detailKey = aircraftKey(plane);
  const trackIdentifier = trafficTrackIdentifier(plane);
  aircraftModal.dataset.aircraftKey = detailKey;
  aircraftTitle.textContent = primaryIdentity;
  if (aircraftTrack) {
    aircraftTrack.disabled = !trackIdentifier;
    aircraftTrack.classList.toggle("active", Boolean(trackIdentifier && trackedAircraft?.nNumber === trackIdentifier));
    aircraftTrack.textContent = trackIdentifier && trackedAircraft?.nNumber === trackIdentifier ? "Tracking" : "Track";
    aircraftTrack.setAttribute(
      "aria-label",
      trackIdentifier && trackedAircraft?.nNumber === trackIdentifier
        ? `Tracking ${trackIdentifier}`
        : trackIdentifier
          ? `Track ${trackIdentifier}`
          : "Aircraft cannot be tracked without a registration or callsign"
    );
  }
  aircraftDetail.innerHTML = `
    <div class="detail-title">${escapeHtml(friendlyType)}</div>
    <dl>
      <div><dt>Registration</dt><dd>${escapeHtml(registration || "Not available")}</dd></div>
      <div><dt>Callsign</dt><dd>${escapeHtml(callsign || "Not available")}</dd></div>
      <div><dt>Aircraft type</dt><dd>${escapeHtml(rawType || "Not available")}</dd></div>
      <div><dt>Altitude</dt><dd>${formatAltitude(plane.altitude)}</dd></div>
      <div><dt>Speed</dt><dd>${formatSpeed(plane.speed)}</dd></div>
      <div><dt>Distance</dt><dd>${distance.toFixed(1)} mi</dd></div>
      <div><dt>Departure</dt><dd>${escapeHtml(plane.departure || "Not available")}</dd></div>
      <div><dt>Destination</dt><dd>${escapeHtml(plane.destination || "Not available")}</dd></div>
      <div><dt>Displayed position</dt><dd>${escapeHtml(plane.displayPositionSource || "CONFIRMED")}</dd></div>
    </dl>
  `;
  aircraftModal.hidden = false;
}

function closeAircraftDetails() {
  aircraftModal.hidden = true;
  aircraftModal.dataset.aircraftKey = "";
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
  setAirportSearchLabel("KDVT - Phoenix Deer Valley");
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
      resetWeatherImageIfMoved(previousCenter, center);
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
        trafficTargetStates.clear();
        previousSweepAngle = null;
        previousRadarSweepBearing = null;
        previousWxTrafficSweepBearing = null;
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

settingsOpen?.addEventListener("click", openSettings);
radarSettingsOpen?.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
trackingOpen?.addEventListener("click", openTracking);
radarTrackingOpen?.addEventListener("click", openTracking);
trackingClose?.addEventListener("click", closeTracking);
trackingClear?.addEventListener("click", clearTrackedAircraft);
document.addEventListener(
  "pointerdown",
  (event) => {
    handleTrackedAircraftClear(event);
  },
  { capture: true }
);
trackingAlertEl?.addEventListener("click", handleTrackedAircraftClear);
legendOpen.addEventListener("click", openLegend);
legendClose.addEventListener("click", closeLegend);

panelToggle.addEventListener("click", () => {
  shell.classList.toggle("panel-collapsed");
  updatePanelToggle();
  window.setTimeout(resizeCanvas, 240);
});

themeToggle?.addEventListener("click", () => {
  setLightTheme(!lightTheme);
});

function handleProximityAlertClear(event) {
  if (event.target.closest(".traffic-alert-clear")) {
    event.preventDefault();
    event.stopPropagation();
    clearActiveTrafficAlert();
    return true;
  }
  return false;
}

proximityAlertEl?.addEventListener("pointerup", (event) => {
  handleProximityAlertClear(event);
});

proximityAlertEl?.addEventListener("click", (event) => {
  if (handleProximityAlertClear(event)) return;
  if (focusActiveAlertFromArc()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!trafficAlertActive || !proximityAlertKey) return;
  proximityAlertSolid = true;
  proximityAlertAudioLevel = proximityAlertAudioLevel === 1 ? 0.5 : 0;
  proximityAlertEl.classList.add("solid");
  if (proximityAlertAudioLevel === 0.5 && !proximityAlertEl.querySelector(".traffic-alert-mute")) {
    proximityAlertEl.insertAdjacentHTML("beforeend", `<span class="traffic-alert-mute">Tap to mute</span>`);
  }
});

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

trackingModal?.addEventListener("click", (event) => {
  if (event.target === trackingModal) closeTracking();
});

legendModal.addEventListener("click", (event) => {
  if (event.target === legendModal) closeLegend();
});

aircraftClose.addEventListener("click", closeAircraftDetails);

aircraftTrack?.addEventListener("click", () => {
  const key = aircraftModal.dataset.aircraftKey;
  if (!key || !trackTrafficTarget(key)) return;
  closeAircraftDetails();
});

aircraftModal.addEventListener("click", (event) => {
  if (event.target === aircraftModal) closeAircraftDetails();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && airportSearchModal && !airportSearchModal.hidden) closeAirportSearchModal();
  if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  if (event.key === "Escape" && trackingModal && !trackingModal.hidden) closeTracking();
  if (event.key === "Escape" && !legendModal.hidden) closeLegend();
  if (event.key === "Escape" && !aircraftModal.hidden) closeAircraftDetails();
});

trackingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const nNumber = normalizeNNumber(trackingNNumberInput?.value);
  const value = Number(trackingValueInput?.value);
  const criterion = trackingCriterionSelect?.value === "time" ? "time" : "distance";
  const isolate = Boolean(trackingIsolateToggle?.checked);

  if (!nNumber) {
    updateTrackingStatus("Enter an N-number to track.");
    trackingNNumberInput?.focus();
    return;
  }

  if (!Number.isFinite(value) || value <= 0) {
    updateTrackingStatus("Enter a positive distance or time value.");
    trackingValueInput?.focus();
    return;
  }

  if (!trackedAircraft || trackedAircraft.nNumber !== nNumber) {
    preserveTrackedAircraftHistory(trackedAircraft);
  }
  trackedAircraft = { nNumber, criterion, value, isolate, alerted: false };
  saveTrackedAircraft();
  updateTrackingControls();
  closeTracking();
  renderList();
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

performanceModeSelect?.addEventListener("change", () => {
  setPerformanceMode(performanceModeSelect.value);
});

radarSoundStyleSelect.value = radarSoundStyle;
if (settingsVersionEl) settingsVersionEl.textContent = APP_ROLLOUT_VERSION;
setLightTheme(lightTheme);
setPerformanceMode(performanceMode, { persist: false });
setOrientationMode(orientationMode, { persist: Boolean(savedOrientationMode) });
setWeatherMode(false);
setWxDisplayMode(wxDisplayMode, { persist: false });
updateAltitudeBracketButton();
updateTrackingControls();
installRadarAudioRecovery();
queueRadarAudioUnlock();
installRadarRangePinch();

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
  setOrientationMode(orientationModeSelect.value === "track" ? "track" : "north");
});

aircraftListEl.addEventListener("click", (event) => {
  const actionButton = event.target.closest(".aircraft-action");
  if (actionButton) {
    event.preventDefault();
    event.stopPropagation();
    if (actionButton.disabled) return;
    const key = actionButton.dataset.aircraftKey;
    if (actionButton.dataset.action === "track") trackTrafficTarget(key);
    else showTrafficTarget(key);
    return;
  }

  const button = event.target.closest("[data-aircraft-key]");
  if (!button) return;
  const key = button.dataset.aircraftKey;
  const plane = aircraft.find((candidate) => aircraftKey(candidate) === key) || radarBlips.get(key);
  zoomToAircraftIfNeeded(plane);
  scheduleAircraftHighlight(key);
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
    setAirportSearchLabel("Use GPS location");
    startGpsTracking();
    return true;
  }

  if (!airportSelect.value) {
    setAirportSearchLabel("Custom coordinates");
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

function setHiddenAirportSelection(value, label) {
  const existingOption = Array.from(airportSelect.options).find((option) => option.value === value);
  if (!existingOption) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    airportSelect.appendChild(option);
  }
  airportSelect.value = value;
  setAirportSearchLabel(label);
}

function selectAirportSearchResult(button) {
  const lat = Number(button.dataset.lat);
  const lon = Number(button.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const label = button.dataset.label || `${button.dataset.ident || "Airport"} selected`;
  setHiddenAirportSelection(`${lat},${lon}`, label);
  renderAirportSearchResults([]);
  applySelectedAirport();
  closeAirportSearchModal();
}

airportSearchOpen?.addEventListener("click", openAirportSearchModal);
airportSearchClose?.addEventListener("click", closeAirportSearchModal);
airportSearchModal?.addEventListener("click", (event) => {
  if (event.target === airportSearchModal) closeAirportSearchModal();
});

airportSearchInput?.addEventListener("input", () => {
  updateAirportSearchResults();
});

airportSearchInput?.addEventListener("focus", () => {
  airportSearchInput.select();
  updateAirportSearchResults();
});

airportSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    renderAirportSearchResults([]);
    setAirportSearchLabel(selectedAirportLabel);
    closeAirportSearchModal();
    return;
  }
  if (event.key !== "Enter") return;
  const firstResult = airportSearchResults?.querySelector(".airport-result");
  if (!firstResult) return;
  event.preventDefault();
  selectAirportSearchResult(firstResult);
});

airportSearchResults?.addEventListener("click", (event) => {
  const button = event.target.closest(".airport-result");
  if (!button) return;
  selectAirportSearchResult(button);
});

document.addEventListener("click", (event) => {
  if (
    airportSearchModal?.hidden &&
    !airportSearchInput?.contains(event.target) &&
    !airportSearchResults?.contains(event.target)
  ) {
    renderAirportSearchResults([]);
    setAirportSearchLabel(selectedAirportLabel);
  }
});

for (const input of [latInput, lonInput]) {
  input.addEventListener("input", () => {
    stopGpsTracking();
    airportSelect.value = "";
    setAirportSearchLabel("Custom coordinates");
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

function refreshNetworkFeeds() {
  if (scratchpadPaused) return;
  nextTrafficFetchAt = 0;
  fetchTraffic({ force: true });
  resetWeatherImage();
  if (showPrecipitation) ensureWeatherImage();
}

window.addEventListener("adsb-scratchpad-pause", (event) => {
  setScratchpadPaused(Boolean(event.detail?.paused));
});

window.addEventListener("adsb-native-device-heading", (event) => {
  const detail = event.detail || {};
  applyCompassHeading(detail.heading, { accuracy: detail.accuracy, source: "native" });
});

window.addEventListener("resize", () => {
  applyResponsivePanelMode();
  resizeCanvas();
});
window.addEventListener("resize", updateProximityAlert);
window.addEventListener("resize", resizeQuickNotesCanvas);
window.visualViewport?.addEventListener("resize", resizeCanvas);
window.visualViewport?.addEventListener("scroll", resizeCanvas);
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => applyResponsivePanelMode(), 80);
  window.setTimeout(() => applyResponsivePanelMode(), 320);
  window.setTimeout(resizeCanvas, 80);
  window.setTimeout(resizeCanvas, 320);
});
window.addEventListener("pageshow", () => {
  applyResponsivePanelMode();
  resizeCanvas();
});
window.addEventListener("online", refreshNetworkFeeds);
window.addEventListener("focus", refreshNetworkFeeds);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    resizeCanvas();
    refreshNetworkFeeds();
  }
});
if ("ResizeObserver" in window && radarWrap) {
  const radarResizeObserver = new ResizeObserver(() => {
    resizeCanvas();
    updateProximityAlert();
    resizeQuickNotesCanvas();
  });
  radarResizeObserver.observe(radarWrap);
}

const initialCenterApplied = applySelectedAirport();
applySavedAirspaceDefaults();
if (smallAirportsToggle) smallAirportsToggle.checked = showSmallAirports;
updateCoordinateVisibility();
applyResponsivePanelMode({ initial: true });
updateRangeIndicator();
resizeCanvas();
renderList();
updateDataSourceIndicator(null);
startTrafficPump();
if (airportSelect.value === "gps" && getVisibleAirspaceClasses().size) {
  fetchAirspace();
}
if (!initialCenterApplied) {
  fetchAirspace();
  fetchTraffic({ force: true });
}
scheduleRender();
