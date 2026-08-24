const degreesToRadians = Math.PI / 180;

export function normalizeDegrees(value) {
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return null;
  return ((degrees % 360) + 360) % 360;
}

export function angularDifferenceDegrees(a, b) {
  const left = normalizeDegrees(a);
  const right = normalizeDegrees(b);
  if (left == null || right == null) return null;
  const difference = Math.abs(left - right);
  return Math.min(difference, 360 - difference);
}

function parseRawMetarWind(rawObservation) {
  const raw = String(rawObservation || "").toUpperCase();
  const match = raw.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (!match) return null;
  return {
    directionDegreesTrue: match[1] === "VRB" ? null : Number(match[1]),
    speedKts: Number(match[2]),
    gustKts: match[3] ? Number(match[3]) : null,
    variable: match[1] === "VRB"
  };
}

export function parseMetarWind(report) {
  if (!report || typeof report !== "object") return null;
  const rawWind = parseRawMetarWind(report.rawOb || report.rawText || report.raw_text);
  const reportedDirection = report.wdir ?? report.windDirection ?? report.wind_dir_degrees;
  const reportedSpeed = Number(report.wspd ?? report.windSpeed ?? report.wind_speed_kt);
  const reportedGust = Number(report.wgst ?? report.windGust ?? report.wind_gust_kt);
  const variable = String(reportedDirection || "").toUpperCase() === "VRB" || rawWind?.variable === true;
  const directionDegreesTrue = variable
    ? null
    : normalizeDegrees(Number.isFinite(Number(reportedDirection)) ? Number(reportedDirection) : rawWind?.directionDegreesTrue);
  const speedKts = Number.isFinite(reportedSpeed) ? reportedSpeed : rawWind?.speedKts;
  const gustKts = Number.isFinite(reportedGust) && reportedGust > 0 ? reportedGust : rawWind?.gustKts ?? null;
  if (!Number.isFinite(speedKts)) return null;

  return {
    directionDegreesTrue,
    speedKts,
    gustKts,
    calm: speedKts === 0,
    variable,
    observedAt: report.obsTime || report.reportTime || report.observation_time || null,
    rawObservation: report.rawOb || report.rawText || report.raw_text || ""
  };
}

export function runwayEndsWithTrueHeadings(runways) {
  return (runways || []).flatMap((runway, runwayIndex) => {
    if (runway.headingReference && runway.headingReference !== "true") return [];
    return [
      { id: runway.leIdent, headingTrue: normalizeDegrees(runway.leHeading), runway, runwayIndex, end: "low" },
      { id: runway.heIdent, headingTrue: normalizeDegrees(runway.heHeading), runway, runwayIndex, end: "high" }
    ].filter((entry) => entry.id && entry.headingTrue != null);
  });
}

export function calculateBestWindRunway(runways, wind, { tieDegrees = 5 } = {}) {
  if (!wind || wind.calm || wind.variable || wind.directionDegreesTrue == null || !Number.isFinite(wind.speedKts)) {
    return { bestEnds: [], candidates: [], reason: wind?.calm ? "calm" : wind?.variable ? "variable" : "unavailable" };
  }

  const candidates = runwayEndsWithTrueHeadings(runways).map((entry) => {
    const angleDegrees = angularDifferenceDegrees(wind.directionDegreesTrue, entry.headingTrue);
    const angleRadians = angleDegrees * degreesToRadians;
    return {
      ...entry,
      angleDegrees,
      headwindKts: wind.speedKts * Math.cos(angleRadians),
      crosswindKts: Math.abs(wind.speedKts * Math.sin(angleRadians))
    };
  });
  if (!candidates.length) return { bestEnds: [], candidates: [], reason: "unavailable" };

  const favorable = candidates.filter((candidate) => candidate.headwindKts >= 0);
  const ranked = (favorable.length ? favorable : candidates).sort(
    (a, b) => b.headwindKts - a.headwindKts || a.crosswindKts - b.crosswindKts || a.id.localeCompare(b.id)
  );
  const best = ranked[0];
  const bestEnds = ranked.filter((candidate) => Math.abs(candidate.angleDegrees - best.angleDegrees) <= tieDegrees);
  return { bestEnds, candidates, reason: "available" };
}

export function formatMetarWind(wind) {
  if (!wind) return "Current METAR unavailable";
  if (wind.calm) return "Wind calm";
  if (wind.variable) return `Wind variable at ${Math.round(wind.speedKts)} kt${wind.gustKts ? `, gust ${Math.round(wind.gustKts)} kt` : ""}`;
  const direction = String(Math.round(wind.directionDegreesTrue)).padStart(3, "0");
  return `Wind ${direction} deg true at ${Math.round(wind.speedKts)} kt${wind.gustKts ? `, gust ${Math.round(wind.gustKts)} kt` : ""}`;
}

const airportTimeZonesByState = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise",
  IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago",
  KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles",
  NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York",
  NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago", WY: "America/Denver", PR: "America/Puerto_Rico", VI: "America/St_Thomas",
  GU: "Pacific/Guam", AS: "Pacific/Pago_Pago", MP: "Pacific/Saipan"
};

export function airportTimeZoneId(airport) {
  if (airport?.timeZone) return airport.timeZone;
  const state = String(airport?.state || "").trim().toUpperCase();
  if (state === "AZ") return "America/Phoenix";
  if (state === "AK") return "America/Anchorage";
  if (state === "HI") return "Pacific/Honolulu";
  return airportTimeZonesByState[state] || "UTC";
}

export function formatAirportLocalTime(airport, date = new Date()) {
  const timeZone = airportTimeZoneId(airport);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(date);
  return formatted.replace(/^24:/, "00:").replace(/\s+/g, " ");
}

export function normalizeTpaRemark(remark) {
  return String(remark || "")
    .replace(/^\s*TPA\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
