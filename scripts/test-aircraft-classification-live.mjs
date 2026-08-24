import fs from "node:fs";
import { aircraftIconClass, classifyAircraftForRadar } from "../public/aircraft-classification.js";

const minutes = Math.max(0.1, Number(process.argv.find((arg) => arg.startsWith("--minutes="))?.split("=")[1]) || 10);
const intervalSeconds = Math.max(5, Number(process.argv.find((arg) => arg.startsWith("--interval="))?.split("=")[1]) || 30);
const endpoint = "https://adsb-radar-proxy.macgyver2.workers.dev/api/aircraft?lat=33.45&lon=-112.07&radiusMiles=100";
const shardCache = new Map();
const latestByTarget = new Map();
const aggregateSamples = Object.fromEntries(Object.values(aircraftIconClass).map((value) => [value, 0]));
let sampleCount = 0;
let totalTargets = 0;
let sufficientMetadataTargets = 0;

function registryRecord(hexValue) {
  const hex = String(hexValue || "").trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return null;
  const prefix = hex.slice(0, 2).toLowerCase();
  const file = new URL(`../public/data/faa-aircraft/${prefix}.json`, import.meta.url);
  if (!fs.existsSync(file)) return null;
  if (!shardCache.has(prefix)) shardCache.set(prefix, JSON.parse(fs.readFileSync(file)).records || {});
  const compact = shardCache.get(prefix)[hex];
  if (!compact) return null;
  return {
    registration: compact[0],
    manufacturer: compact[1],
    model: compact[2],
    aircraftCategory: compact[3],
    displayType: compact[2]
  };
}

function enrich(plane) {
  const enriched = { ...plane, ...(registryRecord(plane.hex || plane.icao) || {}) };
  enriched.rawAircraftType = enriched.rawAircraftType || enriched.type || "";
  return enriched;
}

function targetKey(plane) {
  return plane.hex || plane.icao || plane.callsign || plane.faaTrackNumber || `${plane.lat},${plane.lon}`;
}

async function sample() {
  const response = await fetch(endpoint, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`P50 request failed with HTTP ${response.status}`);
  const payload = await response.json();
  const counts = Object.fromEntries(Object.values(aircraftIconClass).map((value) => [value, 0]));
  let sufficient = 0;
  for (const raw of payload.aircraft || []) {
    const plane = enrich(raw);
    const hasMetadata = Boolean(plane.rawAircraftType || plane.manufacturer || plane.model || plane.displayType);
    if (hasMetadata) sufficient += 1;
    const classification = classifyAircraftForRadar(plane);
    counts[classification] += 1;
    aggregateSamples[classification] += 1;
    latestByTarget.set(targetKey(plane), {
      classification,
      hasMetadata,
      icao: plane.icao || plane.hex || "",
      callsign: plane.callsign || "",
      taisType: plane.rawAircraftType || "",
      manufacturer: plane.manufacturer || "",
      model: plane.model || ""
    });
  }
  sampleCount += 1;
  totalTargets += (payload.aircraft || []).length;
  sufficientMetadataTargets += sufficient;
  console.log(JSON.stringify({
    sample: sampleCount,
    timestamp: new Date().toISOString(),
    source: payload.source,
    targets: (payload.aircraft || []).length,
    sufficientMetadata: sufficient,
    counts
  }));
}

const deadline = Date.now() + minutes * 60_000;
do {
  await sample();
  if (Date.now() + intervalSeconds * 1000 > deadline) break;
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
} while (Date.now() < deadline);

const unique = [...latestByTarget.values()];
const uniqueCounts = Object.fromEntries(Object.values(aircraftIconClass).map((value) => [value, 0]));
for (const target of unique) uniqueCounts[target.classification] += 1;
const classifiedSamples = totalTargets - aggregateSamples[aircraftIconClass.UNKNOWN];
const classifiedUnique = unique.length - uniqueCounts[aircraftIconClass.UNKNOWN];
console.log(JSON.stringify({
  durationMinutes: minutes,
  intervalSeconds,
  sampleCount,
  totalTargetObservations: totalTargets,
  sufficientMetadataObservations: sufficientMetadataTargets,
  aggregateCounts: aggregateSamples,
  observationSuccessPercent: totalTargets ? Math.round((classifiedSamples / totalTargets) * 1000) / 10 : 0,
  uniqueTargets: unique.length,
  uniqueCounts,
  uniqueSuccessPercent: unique.length ? Math.round((classifiedUnique / unique.length) * 1000) / 10 : 0,
  remainingUnknown: unique.filter((target) => target.classification === aircraftIconClass.UNKNOWN)
}, null, 2));
