#!/usr/bin/env node
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url);
const outputUrl = new URL("../public/data/offline-airspace.json", import.meta.url);
const sourceUrl = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query";
const specialUseSourceUrl = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0/query";
const where = "TYPE_CODE='CLASS' AND CLASS in ('B','C','D','E')";
const specialUseWhere = "1=1";
const simplificationTolerance = 0.00018;
const expectedClassBAreas = [
  ["PHX", "PHOENIX"],
  ["LAX", "LOS ANGELES"],
  ["N90", "NEW YORK"],
  ["ORD", "CHICAGO"],
  ["ATL", "ATLANTA"],
  ["SEA", "SEATTLE"]
];

function parseArgs() {
  return {
    pageSize: Number(process.env.AIRSPACE_PAGE_SIZE || 500),
    offset: Number(process.env.AIRSPACE_OFFSET || 0)
  };
}

function formatAirspaceAltitude(value, code) {
  if (code === "SFC") return "SFC";
  if (code === "UNLTD") return "UNLTD";
  if (value === null || value === undefined || value === "") return code || "--";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return code || "--";
  return `${Math.round(parsed / 100)}`;
}

function roundCoord(value) {
  return Number(Number(value).toFixed(5));
}

function normalizeRing(ring) {
  if (!Array.isArray(ring)) return [];
  const normalized = ring
    .map(([lon, lat]) => ({ lat: roundCoord(lat), lon: roundCoord(lon) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (normalized.length < 3) return [];
  return normalized;
}

function perpendicularDistance(point, start, end) {
  const dx = end.lon - start.lon;
  const dy = end.lat - start.lat;
  if (dx === 0 && dy === 0) return Math.hypot(point.lon - start.lon, point.lat - start.lat);
  const t = Math.max(
    0,
    Math.min(1, ((point.lon - start.lon) * dx + (point.lat - start.lat) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(point.lon - (start.lon + t * dx), point.lat - (start.lat + t * dy));
}

function simplifyRing(points, tolerance) {
  if (points.length <= 3) return points;
  const closed = points[0].lat === points.at(-1).lat && points[0].lon === points.at(-1).lon;
  const sourcePoints = closed ? points.slice(0, -1) : points;
  if (sourcePoints.length <= 3) return points;

  const keep = new Uint8Array(sourcePoints.length);
  keep[0] = 1;
  keep[sourcePoints.length - 1] = 1;
  const stack = [[0, sourcePoints.length - 1]];

  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistance(sourcePoints[index], sourcePoints[startIndex], sourcePoints[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > tolerance && maxIndex > -1) {
      keep[maxIndex] = 1;
      stack.push([startIndex, maxIndex], [maxIndex, endIndex]);
    }
  }

  const simplified = sourcePoints.filter((_, index) => keep[index]);
  if (closed) simplified.push(simplified[0]);
  return simplified.length >= 4 ? simplified : points;
}

function boundsForRings(rings) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      west = Math.min(west, point.lon);
      south = Math.min(south, point.lat);
      east = Math.max(east, point.lon);
      north = Math.max(north, point.lat);
    }
  }
  return [roundCoord(west), roundCoord(south), roundCoord(east), roundCoord(north)];
}

function normalizeFeature(feature) {
  const attributes = feature.attributes || {};
  const classCode = attributes.CLASS;
  if (!["B", "C", "D", "E"].includes(classCode)) return null;
  const tolerance = classCode === "E" ? simplificationTolerance * 1.5 : simplificationTolerance;
  const rings = (feature.geometry?.rings || [])
    .map(normalizeRing)
    .filter((ring) => ring.length >= 3)
    .map((ring) => simplifyRing(ring, tolerance));
  if (!rings.length) return null;

  return {
    id: attributes.OBJECTID,
    ident: attributes.IDENT || attributes.ICAO_ID || "",
    icao: attributes.ICAO_ID || "",
    name: attributes.NAME || "",
    classCode,
    type: attributes.TYPE_CODE || "CLASS",
    sector: attributes.SECTOR || "",
    lower: formatAirspaceAltitude(attributes.LOWER_VAL, attributes.LOWER_CODE),
    upper: formatAirspaceAltitude(attributes.UPPER_VAL, attributes.UPPER_CODE),
    bbox: boundsForRings(rings),
    rings
  };
}

function normalizeSpecialUseType(attributes) {
  const typeText = String(attributes.TYPE_CODE || "").toUpperCase();
  const classText = String(attributes.CLASS || "").toUpperCase();
  const nameText = String(attributes.NAME || "").toUpperCase();
  const combined = `${typeText} ${classText} ${nameText}`;
  if (typeText === "P" || combined.includes("PROHIB")) return "P";
  if (typeText === "R" || combined.includes("RESTRICT")) return "R";
  if (typeText === "MOA" || combined.includes("MOA") || combined.includes("MILITARY")) return "MOA";
  if (typeText === "W" || combined.includes("WARNING")) return "W";
  if (typeText === "A" || combined.includes("ALERT")) return "A";
  return "";
}

function normalizeSpecialUseFeature(feature) {
  const attributes = feature.attributes || {};
  const typeCode = normalizeSpecialUseType(attributes);
  if (!["P", "R", "MOA", "W", "A"].includes(typeCode)) return null;
  const rings = (feature.geometry?.rings || [])
    .map(normalizeRing)
    .filter((ring) => ring.length >= 3)
    .map((ring) => simplifyRing(ring, simplificationTolerance));
  if (!rings.length) return null;

  return {
    id: `SUA-${attributes.OBJECTID}`,
    ident: attributes.NAME || "",
    name: attributes.NAME || "",
    classCode: "SUA",
    type: "SUA",
    typeCode,
    sector: "",
    lower: "--",
    upper: "--",
    usage: {
      usLow: attributes.US_LOW ?? null,
      usHigh: attributes.US_HIGH ?? null,
      usArea: attributes.US_AREA ?? null,
      pacific: attributes.PACIFIC ?? null
    },
    bbox: boundsForRings(rings),
    rings
  };
}

async function fetchJson(params, urlBase = sourceUrl) {
  const url = `${urlBase}?${params}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "ADSB-Radar offline data builder" } });
      if (!response.ok) throw new Error(`FAA airspace query failed ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(`FAA airspace query error: ${JSON.stringify(payload.error)}`);
      return payload;
    } catch (error) {
      lastError = error;
      const delayMs = 1000 * attempt;
      console.warn(`FAA airspace query attempt ${attempt} failed; retrying in ${delayMs}ms`, error.message);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function fetchCount() {
  const params = new URLSearchParams({
    f: "json",
    where,
    returnCountOnly: "true"
  });
  const payload = await fetchJson(params);
  return Number(payload.count || 0);
}

async function fetchSpecialUseCount() {
  const params = new URLSearchParams({
    f: "json",
    where: specialUseWhere,
    returnCountOnly: "true"
  });
  const payload = await fetchJson(params, specialUseSourceUrl);
  return Number(payload.count || 0);
}

async function fetchPage(offset, pageSize) {
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields: "OBJECTID,IDENT,ICAO_ID,NAME,CLASS,TYPE_CODE,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE,SECTOR",
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    orderByFields: "OBJECTID",
    geometryPrecision: "5"
  });
  return fetchJson(params);
}

async function fetchSpecialUsePage(offset, pageSize) {
  const params = new URLSearchParams({
    f: "json",
    where: specialUseWhere,
    outFields: "OBJECTID,NAME,TYPE_CODE,CLASS,US_LOW,US_HIGH,US_AREA,PACIFIC",
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    orderByFields: "OBJECTID",
    geometryPrecision: "5"
  });
  return fetchJson(params, specialUseSourceUrl);
}

function validateAirspaces(airspaces) {
  const errors = [];
  const bSearchText = airspaces
    .filter((airspace) => airspace.classCode === "B")
    .map((airspace) => `${airspace.ident} ${airspace.icao} ${airspace.name}`.toUpperCase());
  for (const expectedAliases of expectedClassBAreas) {
    if (!bSearchText.some((text) => expectedAliases.some((expected) => text.includes(expected)))) {
      errors.push(`Missing expected Class B area containing ${expectedAliases.join(" or ")}`);
    }
  }
  for (const airspace of airspaces) {
    if (!["B", "C", "D", "E", "SUA"].includes(airspace.classCode)) {
      errors.push(`Unexpected airspace class ${airspace.classCode}`);
    }
    if (!airspace.rings.length) errors.push(`Airspace ${airspace.id} has no rings`);
    for (const ring of airspace.rings) {
      if (ring.length < 3) errors.push(`Airspace ${airspace.id} has an invalid ring`);
      for (const point of ring) {
        if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) errors.push(`Airspace ${airspace.id} invalid lat`);
        if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) errors.push(`Airspace ${airspace.id} invalid lon`);
      }
    }
    if (!airspace.lower || !airspace.upper) errors.push(`Airspace ${airspace.id} missing floor/ceiling`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

async function main() {
  const { pageSize, offset: initialOffset } = parseArgs();
  const total = await fetchCount();
  const airspaces = [];
  for (let offset = initialOffset; offset < total; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    const rows = (page.features || []).map(normalizeFeature).filter(Boolean);
    airspaces.push(...rows);
    console.log(`Fetched airspace ${Math.min(offset + pageSize, total)}/${total}; kept ${airspaces.length}`);
  }

  const specialUseTotal = await fetchSpecialUseCount();
  for (let offset = initialOffset; offset < specialUseTotal; offset += pageSize) {
    const page = await fetchSpecialUsePage(offset, pageSize);
    const rows = (page.features || []).map(normalizeSpecialUseFeature).filter(Boolean);
    airspaces.push(...rows);
    console.log(`Fetched special-use airspace ${Math.min(offset + pageSize, specialUseTotal)}/${specialUseTotal}; kept ${airspaces.length}`);
  }

  const deduped = Array.from(new Map(airspaces.map((airspace) => [airspace.id, airspace])).values())
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  validateAirspaces(deduped);

  const generatedAt = new Date().toISOString();
  const output = {
    metadata: {
      dataset: "ADSB Radar bundled offline airspace",
      schemaVersion: 2,
      source: "FAA ArcGIS Class_Airspace and Special_Use_Airspace FeatureServers",
      sourceUrl: [
        "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0",
        "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0"
      ],
      sourceLicense: "FAA public airspace feature service; see docs/OFFLINE_DATA.md for attribution notes.",
      sourceDate: generatedAt,
      generatedAt,
      featureCount: deduped.length,
      coverage: "United States national class and special-use airspace coverage available from FAA feature services",
      includedClasses: ["B", "C", "D", "E", "SUA"],
      includedSpecialUseTypes: ["P", "R", "MOA", "W", "A"],
      coordinatePrecision: 5,
      simplificationTolerance
    },
    airspaces: deduped
  };

  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(outputUrl, JSON.stringify(output));
  const size = (await stat(outputUrl)).size;
  console.log(`Wrote ${path.relative(root.pathname, outputUrl.pathname)}: ${deduped.length} features, ${size.toLocaleString()} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
