#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const root = new URL("..", import.meta.url);
const sourceDir = new URL("../data/source/", import.meta.url);
const outputUrl = new URL("../public/data/offline-airports.json", import.meta.url);

const airportsUrl = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const runwaysUrl = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const frequenciesUrl = "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv";
const airportSourcePath = new URL("../data/source/ourairports-airports.csv", import.meta.url);
const runwaySourcePath = new URL("../data/source/ourairports-runways.csv", import.meta.url);
const frequencySourcePath = new URL("../data/source/ourairports-airport-frequencies.csv", import.meta.url);
const defaultNasrCycle = "2026-08-06";
const execFileAsync = promisify(execFile);
const includedCountries = new Set(["US", "PR", "VI", "GU", "AS", "MP", "UM"]);
const includedTypes = new Set(["large_airport", "medium_airport", "small_airport", "seaplane_base"]);
const expectedAirports = ["KPHX", "KLAX", "KJFK", "KORD", "KATL", "KSEA", "PANC", "PHNL", "TJSJ"];

function parseArgs() {
  const cycleArgument = process.argv.find((argument) => argument.startsWith("--nasr-cycle="));
  return {
    refresh: process.argv.includes("--refresh"),
    sourceOnly: process.argv.includes("--source-only"),
    nasrCycle: cycleArgument?.split("=")[1] || process.env.FAA_NASR_CYCLE || defaultNasrCycle
  };
}

function nasrArchiveDate(cycle) {
  const [year, month, day] = String(cycle).split("-").map(Number);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!year || !monthNames[month - 1] || !day) throw new Error(`Invalid FAA NASR cycle ${cycle}`);
  return `${String(day).padStart(2, "0")}_${monthNames[month - 1]}_${year}`;
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

async function downloadArchive(url, destination, { refresh }) {
  await mkdir(sourceDir, { recursive: true });
  if (!refresh) {
    try {
      await stat(destination);
      return;
    } catch {
      // Download below.
    }
  }

  const response = await fetch(url, { headers: { "user-agent": "ADSB-Radar FAA NASR offline data builder" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function readZipEntry(archiveUrl, entryName) {
  const { stdout } = await execFileAsync("unzip", ["-p", archiveUrl.pathname, entryName], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return stdout;
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
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCoord(value) {
  return Number(Number(value).toFixed(6));
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function airportLookupKeys(...values) {
  const keys = new Set();
  for (const value of values) {
    const key = cleanText(value).toUpperCase();
    if (!key) continue;
    keys.add(key);
    if (/^K[A-Z0-9]{3}$/.test(key)) keys.add(key.slice(1));
    if (/^[A-Z0-9]{3}$/.test(key)) keys.add(`K${key}`);
  }
  return [...keys];
}

function mapAirportRecord(map, record, ...keys) {
  for (const key of airportLookupKeys(...keys)) map.set(key, record);
}

function findAirportRecord(map, ...keys) {
  for (const key of airportLookupKeys(...keys)) {
    if (map.has(key)) return map.get(key);
  }
  return null;
}

function groupAirportRecord(map, record, ...keys) {
  for (const key of airportLookupKeys(...keys)) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
}

function groupedAirportRecords(map, ...keys) {
  for (const key of airportLookupKeys(...keys)) {
    if (map.has(key)) return map.get(key);
  }
  return [];
}

function normalizeNasrHours(value) {
  const hours = cleanText(value).toUpperCase();
  if (!hours) return null;
  if (hours === "24" || hours === "ALL") return "24 HR";
  if (/^\d{4}-\d{4}$/.test(hours)) return hours;
  return hours.includes("SEE") || hours.length > 32 ? "See Remarks" : hours;
}

function normalizeAttendanceHours(rows) {
  if (!rows.length) return null;
  if (rows.some((row) => cleanText(row.MONTH).toUpperCase() === "UNATNDD")) return "Unattended";
  if (rows.length === 1) {
    const row = rows[0];
    const month = cleanText(row.MONTH).toUpperCase();
    const day = cleanText(row.DAY).toUpperCase();
    const hour = cleanText(row.HOUR).toUpperCase();
    if (month === "ALL" && day === "ALL" && hour === "ALL") return "24 HR";
    if (hour && hour !== "ALL") return normalizeNasrHours(hour);
  }
  return "See Remarks";
}

function complexTpaRemark(remark) {
  const text = cleanText(remark).toUpperCase();
  if (!text) return false;
  const altitudePairs = text.match(/\d{3,5}\s*\(\d{3,4}\)/g) || [];
  return altitudePairs.length > 1 || /LIGHT|HEAVY|HELICOPTER|PROP|JET|TURBINE|MULTIPLE|DIFFERENT/.test(text);
}

function tpaFromNasr(base, remarks) {
  const publishedAgl = parseNumber(base?.TPA);
  const elevation = parseNumber(base?.ELEV);
  const remark = remarks
    .filter((row) => cleanText(row.REF_COL_NAME).toUpperCase() === "TPA" || cleanText(row.LEGACY_ELEMENT_NUMBER).toUpperCase() === "E147")
    .map((row) => cleanText(row.REMARK))
    .filter(Boolean)
    .join(" ");

  if (remark && complexTpaRemark(remark)) {
    return { kind: "remarks", remark, source: "FAA NASR" };
  }
  if (Number.isFinite(publishedAgl)) {
    const aglFt = Math.round(publishedAgl);
    const mslFt = Number.isFinite(elevation) ? Math.round(elevation + publishedAgl) : null;
    return compactObject({ kind: "published", mslFt, aglFt, remark, source: "FAA NASR" });
  }
  return { kind: "standard", aglFt: 1000, source: "FAA AIM standard guidance" };
}

function nasrFrequencyRoles(row) {
  const use = String(row.FREQ_USE || "").toUpperCase();
  const roles = [];
  if (/\bATIS\b/.test(use)) roles.push("ATIS");
  if (/\bAWOS/.test(use)) roles.push("AWOS");
  if (/\bASOS/.test(use)) roles.push("ASOS");
  if (/CLNC|CLEARANCE/.test(use)) roles.push("Clearance");
  if (/\bGND/.test(use)) roles.push("Ground");
  if (/\bLCL(?:\/|\b)|\bTWR|\bTOWER/.test(use)) roles.push("Tower");
  if (/\bCTAF\b/.test(use)) roles.push("CTAF");
  if (/\bUNICOM\b/.test(use)) roles.push("UNICOM");
  if (/\bAPCH|APPROACH/.test(use)) roles.push("Approach");
  if (/\bDEP|DEPARTURE/.test(use)) roles.push("Departure");
  return [...new Set(roles)];
}

function normalizeNasrFrequencies(rows) {
  const roleOrder = ["ATIS", "AWOS", "ASOS", "Clearance", "Ground", "Tower", "CTAF", "UNICOM", "Approach", "Departure"];
  const byFrequency = new Map();
  for (const row of rows) {
    const frequencyMHz = parseNumber(row.FREQ);
    const roles = nasrFrequencyRoles(row);
    if (!Number.isFinite(frequencyMHz) || frequencyMHz < 108 || frequencyMHz > 137 || !roles.length) continue;
    const key = frequencyMHz.toFixed(3);
    if (!byFrequency.has(key)) {
      byFrequency.set(key, {
        frequencyMHz: Number(key),
        roles: new Set(),
        description: cleanText(row.FREQ_USE),
        source: "FAA NASR FRQ"
      });
    }
    const entry = byFrequency.get(key);
    for (const role of roles) entry.roles.add(role);
  }
  return [...byFrequency.values()]
    .map((entry) => ({ ...entry, roles: [...entry.roles].sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)) }))
    .sort((a, b) => roleOrder.indexOf(a.roles[0]) - roleOrder.indexOf(b.roles[0]) || a.frequencyMHz - b.frequencyMHz)
    .slice(0, 24);
}

function normalizeNasrRunways(runwayRows, runwayEndRows) {
  const endsByRunway = new Map();
  for (const row of runwayEndRows) {
    const key = `${row.RWY_ID}|${row.RWY_END_ID}`;
    endsByRunway.set(key, row);
  }

  return runwayRows.map((row) => {
    const [leIdent, heIdent] = cleanText(row.RWY_ID).split("/");
    const low = endsByRunway.get(`${row.RWY_ID}|${leIdent}`);
    const high = endsByRunway.get(`${row.RWY_ID}|${heIdent}`);
    const leLat = parseNumber(low?.LAT_DECIMAL);
    const leLon = parseNumber(low?.LONG_DECIMAL);
    const heLat = parseNumber(high?.LAT_DECIMAL);
    const heLon = parseNumber(high?.LONG_DECIMAL);
    if (!leIdent || !heIdent || ![leLat, leLon, heLat, heLon].every(Number.isFinite)) return null;
    return compactObject({
      leIdent,
      heIdent,
      leLat: roundCoord(leLat),
      leLon: roundCoord(leLon),
      heLat: roundCoord(heLat),
      heLon: roundCoord(heLon),
      lengthFt: parseNumber(row.RWY_LEN),
      widthFt: parseNumber(row.RWY_WIDTH),
      surface: row.SURFACE_TYPE_CODE,
      leHeading: parseNumber(low?.TRUE_ALIGNMENT),
      heHeading: parseNumber(high?.TRUE_ALIGNMENT),
      headingReference: "true",
      source: "FAA NASR APT"
    });
  }).filter(Boolean);
}

function mergeRunways(preferred, fallback) {
  const merged = new Map();
  const keyFor = (runway) => [runway.leIdent, runway.heIdent].filter(Boolean).join("/").toUpperCase();
  for (const runway of fallback || []) {
    const key = keyFor(runway);
    if (key) merged.set(key, runway);
  }
  for (const runway of preferred || []) {
    const key = keyFor(runway);
    if (key) merged.set(key, runway);
  }
  return [...merged.values()];
}

function buildNasrIndex(csv) {
  const baseByAirport = new Map();
  const towerByAirport = new Map();
  const remarksByAirport = new Map();
  const attendanceByAirport = new Map();
  const frequenciesByAirport = new Map();
  const runwaysByAirport = new Map();

  for (const row of parseCsv(csv.aptBase)) mapAirportRecord(baseByAirport, row, row.ARPT_ID, row.ICAO_ID);
  for (const row of parseCsv(csv.atcBase)) mapAirportRecord(towerByAirport, row, row.FACILITY_ID, row.ICAO_ID);
  for (const row of parseCsv(csv.aptRemarks)) groupAirportRecord(remarksByAirport, row, row.ARPT_ID);
  for (const row of parseCsv(csv.aptAttendance)) groupAirportRecord(attendanceByAirport, row, row.ARPT_ID);
  for (const row of parseCsv(csv.frequencies)) groupAirportRecord(frequenciesByAirport, row, row.SERVICED_FACILITY);

  const runwayEndsByAirport = new Map();
  for (const row of parseCsv(csv.aptRunwayEnds)) groupAirportRecord(runwayEndsByAirport, row, row.ARPT_ID);
  for (const row of parseCsv(csv.aptRunways)) groupAirportRecord(runwaysByAirport, row, row.ARPT_ID);

  return {
    baseByAirport,
    towerByAirport,
    remarksByAirport,
    attendanceByAirport,
    frequenciesByAirport,
    runwaysByAirport,
    runwayEndsByAirport
  };
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
    surface: row.surface,
    leHeading: parseNumber(row.le_heading_degT),
    heHeading: parseNumber(row.he_heading_degT),
    headingReference: "true"
  });
}

function normalizeFrequency(row) {
  const frequencyMHz = parseNumber(row.frequency_mhz);
  if (!row.airport_ident || !Number.isFinite(frequencyMHz) || frequencyMHz <= 0) return null;
  return compactObject({
    type: row.type,
    description: row.description,
    frequencyMHz: Number(frequencyMHz.toFixed(3))
  });
}

function normalizeAirport(row, runwaysByIdent, frequenciesByIdent, nasrIndex) {
  const lat = parseNumber(row.latitude_deg);
  const lon = parseNumber(row.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (!includedCountries.has(row.iso_country)) return null;
  if (!includedTypes.has(row.type)) return null;
  if (row.type === "closed") return null;

  const ident = row.ident || row.gps_code || row.local_code || row.icao_code;
  if (!ident) return null;

  const nasrBase = findAirportRecord(nasrIndex.baseByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrTower = findAirportRecord(nasrIndex.towerByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrRemarks = groupedAirportRecords(nasrIndex.remarksByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrAttendance = groupedAirportRecords(nasrIndex.attendanceByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrFrequencyRows = groupedAirportRecords(nasrIndex.frequenciesByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrRunwayRows = groupedAirportRecords(nasrIndex.runwaysByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const nasrRunwayEndRows = groupedAirportRecords(nasrIndex.runwayEndsByAirport, row.ident, row.gps_code, row.local_code, row.icao_code);
  const faaRunways = normalizeNasrRunways(nasrRunwayRows, nasrRunwayEndRows);
  const runways = mergeRunways(faaRunways, runwaysByIdent.get(row.ident) || [])
    .sort((a, b) => (b.lengthFt || 0) - (a.lengthFt || 0))
    .slice(0, 12);
  const faaFrequencies = normalizeNasrFrequencies(nasrFrequencyRows);
  const frequencies = faaFrequencies.length
    ? faaFrequencies
    : (frequenciesByIdent.get(row.ident) || [])
        .slice()
        .sort((a, b) => (a.type || "").localeCompare(b.type || "") || a.frequencyMHz - b.frequencyMHz)
        .slice(0, 24);

  const towered = nasrBase
    ? cleanText(nasrBase.TWR_TYPE_CODE).toUpperCase() !== "NON-ATCT"
    : nasrTower
      ? cleanText(nasrTower.FACILITY_TYPE).toUpperCase().includes("ATCT")
      : null;
  const towerHours = towered ? normalizeNasrHours(nasrTower?.TWR_HRS) : null;
  const facilityHours = normalizeAttendanceHours(nasrAttendance);

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
    runways,
    frequencies,
    tpa: tpaFromNasr(nasrBase, nasrRemarks),
    towered,
    towerHours,
    facilityHours,
    faaSourceCycle: nasrBase?.EFF_DATE || nasrTower?.EFF_DATE
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
  const archiveDate = nasrArchiveDate(args.nasrCycle);
  const nasrBaseUrl = "https://nfdc.faa.gov/webContent/28DaySub/extra/";
  const nasrPaths = {
    apt: new URL(`../data/source/faa-nasr-${args.nasrCycle}-apt.zip`, import.meta.url),
    atc: new URL(`../data/source/faa-nasr-${args.nasrCycle}-atc.zip`, import.meta.url),
    frq: new URL(`../data/source/faa-nasr-${args.nasrCycle}-frq.zip`, import.meta.url)
  };
  await Promise.all([
    downloadArchive(`${nasrBaseUrl}${archiveDate}_APT_CSV.zip`, nasrPaths.apt, args),
    downloadArchive(`${nasrBaseUrl}${archiveDate}_ATC_CSV.zip`, nasrPaths.atc, args),
    downloadArchive(`${nasrBaseUrl}${archiveDate}_FRQ_CSV.zip`, nasrPaths.frq, args)
  ]);
  const [airportCsv, runwayCsv, frequencyCsv] = await Promise.all([
    download(airportsUrl, airportSourcePath, args),
    download(runwaysUrl, runwaySourcePath, args),
    download(frequenciesUrl, frequencySourcePath, args)
  ]);
  if (args.sourceOnly) return;

  const [aptBase, aptAttendance, aptRemarks, aptRunways, aptRunwayEnds, atcBase, nasrFrequencies] = await Promise.all([
    readZipEntry(nasrPaths.apt, "APT_BASE.csv"),
    readZipEntry(nasrPaths.apt, "APT_ATT.csv"),
    readZipEntry(nasrPaths.apt, "APT_RMK.csv"),
    readZipEntry(nasrPaths.apt, "APT_RWY.csv"),
    readZipEntry(nasrPaths.apt, "APT_RWY_END.csv"),
    readZipEntry(nasrPaths.atc, "ATC_BASE.csv"),
    readZipEntry(nasrPaths.frq, "FRQ.csv")
  ]);
  const nasrIndex = buildNasrIndex({
    aptBase,
    aptAttendance,
    aptRemarks,
    aptRunways,
    aptRunwayEnds,
    atcBase,
    frequencies: nasrFrequencies
  });

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
  const frequencyRows = parseCsv(frequencyCsv);
  const frequenciesByIdent = new Map();
  for (const row of frequencyRows) {
    const frequency = normalizeFrequency(row);
    if (!frequency) continue;
    if (!frequenciesByIdent.has(row.airport_ident)) frequenciesByIdent.set(row.airport_ident, []);
    frequenciesByIdent.get(row.airport_ident).push(frequency);
  }
  const airports = dedupeAirports(
    airportRows.map((row) => normalizeAirport(row, runwaysByIdent, frequenciesByIdent, nasrIndex)).filter(Boolean)
  );
  validateAirports(airports);

  const generatedAt = new Date().toISOString();
  const output = {
    metadata: {
      dataset: "ADSB Radar bundled offline airports",
      schemaVersion: 3,
      source: "OurAirports base data enriched with FAA NASR APT, ATC, and FRQ data",
      sourceUrl: [
        "https://davidmegginson.github.io/ourairports-data/",
        `https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/${args.nasrCycle}/`
      ],
      sourceLicense: "OurAirports public-domain data and U.S. FAA public aeronautical data; see docs/OFFLINE_DATA.md.",
      sourceDate: generatedAt,
      faaNasrCycle: args.nasrCycle,
      generatedAt,
      recordCount: airports.length,
      coverage: "United States, Puerto Rico, U.S. Virgin Islands, Guam, American Samoa, Northern Mariana Islands, and U.S. minor outlying islands",
      sourceSha256: {
        airports: createHash("sha256").update(airportCsv).digest("hex"),
        runways: createHash("sha256").update(runwayCsv).digest("hex"),
        frequencies: createHash("sha256").update(frequencyCsv).digest("hex"),
        faaApt: createHash("sha256").update(aptBase).update(aptAttendance).update(aptRemarks).update(aptRunways).update(aptRunwayEnds).digest("hex"),
        faaAtc: createHash("sha256").update(atcBase).digest("hex"),
        faaFrq: createHash("sha256").update(nasrFrequencies).digest("hex")
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
