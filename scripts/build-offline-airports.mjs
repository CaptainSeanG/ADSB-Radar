#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = new URL("..", import.meta.url);
const sourceDir = new URL("../data/source/", import.meta.url);
const outputUrl = new URL("../public/data/offline-airports.json", import.meta.url);

const airportsUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const runwaysUrl = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const airportSourcePath = new URL("../data/source/ourairports-airports.csv", import.meta.url);
const runwaySourcePath = new URL("../data/source/ourairports-runways.csv", import.meta.url);
const includedCountries = new Set(["US", "PR", "VI", "GU", "AS", "MP", "UM"]);
const includedTypes = new Set(["large_airport", "medium_airport", "small_airport", "seaplane_base"]);
const expectedAirports = ["KPHX", "KLAX", "KJFK", "KORD", "KATL", "KSEA", "PANC", "PHNL", "TJSJ"];

function parseArgs() {
  return {
    refresh: process.argv.includes("--refresh"),
    sourceOnly: process.argv.includes("--source-only")
  };
}

async function download(url, destination, { refresh }) {
  await mkdir(sourceDir, { recursive: true });
  if (!refresh) {
    try {
      await stat(destination);
      return await readFile(destination, "utf8");
    } catch {
      // Download below.
    }
  }

  const response = await fetch(url, { headers: { "user-agent": "ADSB-Radar offline data builder" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  const text = await response.text();
  await writeFile(destination, text);
  return text;
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

function parseCsv(csv) {
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  }).filter((row) => Object.values(row).some(Boolean));
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCoord(value) {
  return Number(Number(value).toFixed(6));
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function normalizeRunway(row) {
  const leLat = parseNumber(row.le_latitude_deg);
  const leLon = parseNumber(row.le_longitude_deg);
  const heLat = parseNumber(row.he_latitude_deg);
  const heLon = parseNumber(row.he_longitude_deg);
  if (![leLat, leLon, heLat, heLon].every(Number.isFinite)) return null;

  return compactObject({
    leIdent: row.le_ident,
    heIdent: row.he_ident,
    leLat: roundCoord(leLat),
    leLon: roundCoord(leLon),
    heLat: roundCoord(heLat),
    heLon: roundCoord(heLon),
    lengthFt: parseNumber(row.length_ft),
    widthFt: parseNumber(row.width_ft),
    leHeading: parseNumber(row.le_heading_degT),
    heHeading: parseNumber(row.he_heading_degT)
  });
}

function normalizeAirport(row, runwaysByIdent) {
  const lat = parseNumber(row.latitude_deg);
  const lon = parseNumber(row.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (!includedCountries.has(row.iso_country)) return null;
  if (!includedTypes.has(row.type)) return null;
  if (row.type === "closed") return null;

  const ident = row.ident || row.gps_code || row.local_code || row.icao_code;
  if (!ident) return null;

  const runways = (runwaysByIdent.get(row.ident) || [])
    .sort((a, b) => (b.lengthFt || 0) - (a.lengthFt || 0))
    .slice(0, 12);

  const state = row.iso_region?.startsWith(`${row.iso_country}-`) ? row.iso_region.slice(3) : row.iso_region;
  return compactObject({
    ident,
    icao: row.icao_code,
    faa: row.local_code || row.gps_code,
    name: row.name || ident,
    type: row.type,
    lat: roundCoord(lat),
    lon: roundCoord(lon),
    elevationFt: parseNumber(row.elevation_ft),
    municipality: row.municipality,
    state,
    country: row.iso_country,
    publicUse: row.type !== "small_airport" ? true : null,
    scheduledService: row.scheduled_service === "yes",
    iata: row.iata_code,
    runways
  });
}

function dedupeAirports(airports) {
  const byIdent = new Map();
  for (const airport of airports) {
    const existing = byIdent.get(airport.ident);
    if (!existing || airportScore(airport) > airportScore(existing)) {
      byIdent.set(airport.ident, airport);
    }
  }
  return Array.from(byIdent.values()).sort((a, b) => a.ident.localeCompare(b.ident));
}

function airportScore(airport) {
  const typeScore = airport.type === "large_airport" ? 4 : airport.type === "medium_airport" ? 3 : airport.type === "small_airport" ? 2 : 1;
  return typeScore * 1000 + (airport.runways?.length || 0) * 10 + (airport.scheduledService ? 5 : 0);
}

function validateAirports(airports) {
  const errors = [];
  const seen = new Set();
  for (const airport of airports) {
    if (seen.has(airport.ident)) errors.push(`Duplicate airport ident ${airport.ident}`);
    seen.add(airport.ident);
    if (!Number.isFinite(airport.lat) || airport.lat < -90 || airport.lat > 90) errors.push(`Invalid latitude for ${airport.ident}`);
    if (!Number.isFinite(airport.lon) || airport.lon < -180 || airport.lon > 180) errors.push(`Invalid longitude for ${airport.ident}`);
  }
  for (const ident of expectedAirports) {
    if (!seen.has(ident)) errors.push(`Missing expected airport ${ident}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

async function main() {
  const args = parseArgs();
  const [airportCsv, runwayCsv] = await Promise.all([
    download(airportsUrl, airportSourcePath, args),
    download(runwaysUrl, runwaySourcePath, args)
  ]);
  if (args.sourceOnly) return;

  const runwayRows = parseCsv(runwayCsv);
  const runwaysByIdent = new Map();
  for (const row of runwayRows) {
    if (row.closed === "1") continue;
    const runway = normalizeRunway(row);
    if (!runway) continue;
    if (!runwaysByIdent.has(row.airport_ident)) runwaysByIdent.set(row.airport_ident, []);
    runwaysByIdent.get(row.airport_ident).push(runway);
  }

  const airportRows = parseCsv(airportCsv);
  const airports = dedupeAirports(
    airportRows.map((row) => normalizeAirport(row, runwaysByIdent)).filter(Boolean)
  );
  validateAirports(airports);

  const generatedAt = new Date().toISOString();
  const output = {
    metadata: {
      dataset: "ADSB Radar bundled offline airports",
      schemaVersion: 2,
      source: "OurAirports airports.csv and runways.csv",
      sourceUrl: "https://davidmegginson.github.io/ourairports-data/",
      sourceLicense: "OurAirports open/public downloadable data; see docs/OFFLINE_DATA.md for attribution notes.",
      sourceDate: generatedAt,
      generatedAt,
      recordCount: airports.length,
      coverage: "United States, Puerto Rico, U.S. Virgin Islands, Guam, American Samoa, Northern Mariana Islands, and U.S. minor outlying islands",
      sourceSha256: {
        airports: createHash("sha256").update(airportCsv).digest("hex"),
        runways: createHash("sha256").update(runwayCsv).digest("hex")
      }
    },
    airports
  };

  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(outputUrl, JSON.stringify(output));
  const size = (await stat(outputUrl)).size;
  console.log(`Wrote ${path.relative(root.pathname, outputUrl.pathname)}: ${airports.length} airports, ${size.toLocaleString()} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
