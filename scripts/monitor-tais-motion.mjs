import {
  deriveConfirmedMotion,
  distanceMilesBetween,
  projectConfirmedTraffic
} from "../public/traffic-prediction.js";
import { readFile } from "node:fs/promises";
import { normalizeIcaoHex, registryRecordFromCompact } from "../public/aircraft-registry.js";

const endpoint = process.env.TAIS_MOTION_URL ||
  "https://adsb-radar-proxy.macgyver2.workers.dev/api/aircraft?lat=33.45&lon=-112.07&radiusMiles=100";
const durationSeconds = Number(process.env.TAIS_MOTION_SECONDS || 900);
const sweepSeconds = Number(process.env.TAIS_SWEEP_SECONDS || 3.4);
const pollSeconds = Number(process.env.TAIS_POLL_SECONDS || 1.5);
const states = new Map();
const updateIntervals = [];
const correctionsMeters = [];
let requests = 0;
let confirmedUpdates = 0;
let duplicateObservations = 0;
let predictedTargetSweeps = 0;
let sourceFailures = 0;
let lastPayload = null;
const registryShards = new Map();

async function resolveRegistryRecord(value) {
  const hex = normalizeIcaoHex(value);
  if (!hex) return null;
  const prefix = hex.slice(0, 2).toLowerCase();
  if (!registryShards.has(prefix)) {
    const promise = readFile(new URL(`../public/data/faa-aircraft/${prefix}.json`, import.meta.url), "utf8")
      .then((content) => JSON.parse(content).records || {})
      .catch(() => ({}));
    registryShards.set(prefix, promise);
  }
  const records = await registryShards.get(prefix);
  return registryRecordFromCompact(hex, records[hex]);
}

const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const rounded = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const startedAt = Date.now();
let nextSweepAt = startedAt + sweepSeconds * 1000;

while (Date.now() - startedAt < durationSeconds * 1000) {
  const response = await fetch(`${endpoint}&motionSample=${Date.now()}`, {
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  requests += 1;
  if (!response.ok || payload.source !== "FAA TAIS") {
    sourceFailures += 1;
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
    continue;
  }
  lastPayload = payload;
  const currentKeys = new Set();

  for (const plane of payload.aircraft || []) {
    const key = String(plane.hex || plane.icao || "");
    const timestamp = Number(plane.positionObservedAt);
    if (!key || !Number.isFinite(timestamp)) continue;
    currentKeys.add(key);
    const previous = states.get(key);

    if (!previous) {
      states.set(key, {
        sourceType: "faa",
        confirmedLat: Number(plane.lat),
        confirmedLon: Number(plane.lon),
        confirmedAltitude: plane.altitude,
        confirmedTimestamp: timestamp,
        confirmedTrack: null,
        confirmedGroundSpeed: null,
        identity: key
      });
      continue;
    }

    if (timestamp > previous.confirmedTimestamp + 1) {
      const intervalSeconds = (timestamp - previous.confirmedTimestamp) / 1000;
      updateIntervals.push(intervalSeconds);
      const projectedAtConfirmation = projectConfirmedTraffic(previous, timestamp);
      if (projectedAtConfirmation) {
        correctionsMeters.push(
          distanceMilesBetween(projectedAtConfirmation.lat, projectedAtConfirmation.lon, plane.lat, plane.lon) * 1609.344
        );
      }
      const motion = deriveConfirmedMotion(previous, plane, timestamp);
      states.set(key, {
        ...previous,
        previousConfirmedLat: previous.confirmedLat,
        previousConfirmedLon: previous.confirmedLon,
        previousConfirmedTimestamp: previous.confirmedTimestamp,
        confirmedLat: Number(plane.lat),
        confirmedLon: Number(plane.lon),
        confirmedAltitude: plane.altitude,
        confirmedTimestamp: timestamp,
        confirmedTrack: motion.track,
        confirmedGroundSpeed: motion.groundspeed,
        derivedTrack: motion.track,
        derivedGroundSpeed: motion.groundspeed,
        motionAccepted: motion.accepted
      });
      confirmedUpdates += 1;
    } else {
      duplicateObservations += 1;
    }
  }

  for (const key of states.keys()) {
    if (!currentKeys.has(key)) states.delete(key);
  }

  const now = Date.now();
  if (now >= nextSweepAt) {
    for (const [key, state] of states.entries()) {
      if (
        state.lastSweepConfirmedTimestamp === state.confirmedTimestamp &&
        projectConfirmedTraffic(state, now)
      ) {
        predictedTargetSweeps += 1;
      }
      states.set(key, { ...state, lastSweepConfirmedTimestamp: state.confirmedTimestamp });
    }
    while (nextSweepAt <= now) nextSweepAt += sweepSeconds * 1000;
  }
  await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
}

const activeStates = [...states.values()];
const usableMotion = activeStates.filter((state) =>
  Number.isFinite(Number(state.confirmedTrack)) && Number.isFinite(Number(state.confirmedGroundSpeed))
).length;
const averageCorrection = correctionsMeters.length
  ? correctionsMeters.reduce((sum, value) => sum + value, 0) / correctionsMeters.length
  : null;
const finalAircraft = lastPayload?.aircraft || [];
const identificationRows = await Promise.all(
  finalAircraft.map(async (plane) => {
    const registry = await resolveRegistryRecord(plane.hex || plane.icao);
    const callsign = String(plane.callsign || "").trim();
    const taisType = String(plane.type || "").trim();
    const hex = normalizeIcaoHex(plane.hex || plane.icao);
    return { plane, registry, callsign, taisType, hex };
  })
);
const icaoAddressed = identificationRows.filter((row) => row.hex);
const resolvedRegistration = icaoAddressed.filter((row) => row.registry?.registration);
const resolvedModel = icaoAddressed.filter((row) => row.registry?.model);
const withTaisType = identificationRows.filter((row) => row.taisType);
const rawOnly = identificationRows.filter(
  (row) => !row.callsign && !row.taisType && !row.registry?.registration && !row.registry?.model
);
const percent = (count, total) => (total ? rounded((count / total) * 100, 1) : null);

console.log(JSON.stringify({
  durationSeconds: rounded((Date.now() - startedAt) / 1000, 1),
  requests,
  pollSeconds,
  sweepSeconds,
  sourceFailures,
  finalSource: lastPayload?.source || null,
  finalActiveTracks: activeStates.length,
  confirmedUpdates,
  duplicateObservations,
  predictedTargetSweeps,
  usableDerivedMotionTracks: usableMotion,
  usableDerivedMotionPercent: activeStates.length ? rounded((usableMotion / activeStates.length) * 100, 1) : null,
  confirmedUpdateIntervalSeconds: {
    samples: updateIntervals.length,
    median: rounded(percentile(updateIntervals, 0.5), 3),
    p95: rounded(percentile(updateIntervals, 0.95), 3)
  },
  correctionErrorMeters: {
    samples: correctionsMeters.length,
    average: rounded(averageCorrection, 1),
    p95: rounded(percentile(correctionsMeters, 0.95), 1),
    worst: rounded(correctionsMeters.length ? Math.max(...correctionsMeters) : null, 1)
  },
  identification: {
    totalTargets: identificationRows.length,
    icaoAddressedTargets: icaoAddressed.length,
    faaRegistrationResolved: resolvedRegistration.length,
    faaRegistrationResolvedPercentOfIcao: percent(resolvedRegistration.length, icaoAddressed.length),
    faaModelResolved: resolvedModel.length,
    faaModelResolvedPercentOfIcao: percent(resolvedModel.length, icaoAddressed.length),
    taisAircraftType: withTaisType.length,
    taisAircraftTypePercent: percent(withTaisType.length, identificationRows.length),
    rawIdentityOnly: rawOnly.length,
    rawIdentityOnlyPercent: percent(rawOnly.length, identificationRows.length),
    examples: identificationRows
      .filter((row) => row.registry || row.taisType || row.callsign)
      .slice(0, 10)
      .map((row) => ({
        hex: row.hex || row.plane.hex || "",
        callsign: row.callsign,
        registration: row.registry?.registration || "",
        taisType: row.taisType,
        manufacturer: row.registry?.manufacturer || "",
        model: row.registry?.model || ""
      }))
  }
}, null, 2));
