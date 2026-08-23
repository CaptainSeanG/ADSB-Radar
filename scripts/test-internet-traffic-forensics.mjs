import assert from "node:assert/strict";
import { classifyInternetPositionObservation } from "../public/traffic-ingestion.js";
import { projectConfirmedTraffic } from "../public/traffic-prediction.js";

class MockCache {
  constructor() {
    this.store = new Map();
  }

  async match(request) {
    const value = this.store.get(request.url);
    return value ? new Response(value, { headers: { "content-type": "application/json" } }) : undefined;
  }

  async put(request, response) {
    this.store.set(request.url, await response.text());
  }
}

class MockKV {
  constructor() {
    this.store = new Map();
  }

  async get(key, type) {
    const value = this.store.get(key);
    return value ? (type === "json" ? JSON.parse(value) : value) : null;
  }

  async put(key, value) {
    this.store.set(key, value);
  }
}

const recordedReports = [
  {
    providerNow: 1787275923500,
    raw: {
      hex: "a64172",
      flight: "VAR502",
      lat: 33.500108,
      lon: -113.421002,
      alt_baro: 7100,
      gs: 150.7,
      track: 95.33,
      baro_rate: -64,
      seen: 0,
      seen_pos: 0.036
    }
  },
  {
    providerNow: 1787275977501,
    raw: {
      hex: "a64172",
      flight: "VAR502",
      lat: 33.496948,
      lon: -113.376599,
      alt_baro: 7075,
      gs: 146.6,
      track: 95.09,
      baro_rate: 64,
      seen: 0.3,
      seen_pos: 0.329
    }
  },
  {
    providerNow: 1787277471501,
    raw: {
      hex: "a64172",
      flight: "VAR502",
      lat: 33.428021,
      lon: -112.369271,
      alt_baro: "ground",
      gs: 8.8,
      track: null,
      baro_rate: null,
      seen: 5.1,
      seen_pos: 5.052
    }
  }
];

const realDateNow = Date.now;
const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
let fakeNow = recordedReports[0].providerNow + 500;
let activeReport = recordedReports[0];
let upstreamCalls = 0;
Date.now = () => fakeNow;
globalThis.caches = { default: new MockCache() };
globalThis.fetch = async () => {
  upstreamCalls += 1;
  return new Response(JSON.stringify({ now: activeReport.providerNow, ac: [activeReport.raw] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

const pendingBackground = [];
const context = {
  waitUntil(promise) {
    pendingBackground.push(promise);
  }
};

async function workerRequest(worker) {
  const response = await worker.fetch(
    new Request("https://worker.test/api/aircraft?lat=33.45&lon=-112.07&radiusMiles=100&debugHex=a64172"),
    { ADSB_LKG_KV: new MockKV() },
    context
  );
  return response.json();
}

async function runWorkerReplay() {
  const worker = (await import(`../workers/adsb-proxy.js?forensics=${Math.random()}`)).default;
  const first = await workerRequest(worker);
  assert.equal(first.total, 1);
  assert.equal(first.debugTarget.raw.lat, recordedReports[0].raw.lat);
  assert.equal(first.debugTarget.raw.lon, recordedReports[0].raw.lon);
  assert.equal(first.debugTarget.positionTimestampTrusted, true);

  fakeNow += 7_000;
  await workerRequest(worker);
  await Promise.all(pendingBackground.splice(0));
  const duplicate = await workerRequest(worker);
  assert.equal(duplicate.upstreamSnapshotId, first.upstreamSnapshotId);
  assert.equal(duplicate.upstreamSnapshotHash, first.upstreamSnapshotHash);
  assert.equal(duplicate.aircraft[0].positionObservedAt, first.aircraft[0].positionObservedAt);
  assert.equal(duplicate.aircraft[0].workerRetrievedAt > first.aircraft[0].workerRetrievedAt, true);

  activeReport = recordedReports[1];
  fakeNow = activeReport.providerNow + 500;
  await workerRequest(worker);
  await Promise.all(pendingBackground.splice(0));
  const changed = await workerRequest(worker);
  assert.notEqual(changed.upstreamSnapshotId, first.upstreamSnapshotId);
  assert.notEqual(changed.aircraft[0].positionObservedAt, first.aircraft[0].positionObservedAt);
  assert.notEqual(changed.aircraft[0].lon, first.aircraft[0].lon);

  return { first, duplicate, changed };
}

async function runZeroSeenPosReplay() {
  globalThis.caches = { default: new MockCache() };
  activeReport = {
    providerNow: 1787276000000,
    raw: {
      ...recordedReports[1].raw,
      hex: "zeroage",
      seen: 0,
      seen_pos: 0
    }
  };
  fakeNow = activeReport.providerNow + 750;
  const worker = (await import(`../workers/adsb-proxy.js?zero-seen-pos=${Math.random()}`)).default;
  const response = await workerRequest(worker);
  const target = response.aircraft.find((plane) => plane.hex === "zeroage");
  assert.ok(target);
  assert.equal(target.seenPos, 0);
  assert.equal(target.sourcePositionAgeSeconds, 0);
  assert.equal(target.positionObservedAt, activeReport.providerNow);
  assert.equal(target.positionTimestampTrusted, true);
  assert.equal(target.workerRetrievedAt, fakeNow);
}

function appPlane(report, snapshotId) {
  const positionObservedAt = report.providerNow - report.raw.seen_pos * 1000;
  return {
    hex: report.raw.hex,
    callsign: report.raw.flight,
    lat: report.raw.lat,
    lon: report.raw.lon,
    altitude: report.raw.alt_baro,
    speed: report.raw.gs,
    track: report.raw.track,
    verticalRate: report.raw.baro_rate,
    positionObservedAt,
    updatedAt: positionObservedAt,
    positionTimestampTrusted: true,
    upstreamSnapshotId: snapshotId
  };
}

function applyObservation(previous, plane, snapshotId, sequence) {
  const result = classifyInternetPositionObservation(previous, plane, snapshotId);
  const nextSequence = result.isNewPosition ? sequence + 1 : sequence;
  return {
    result,
    sequence: nextSequence,
    state: {
      sourceType: "internet",
      pendingPlane: plane,
      confirmedLat: result.isNewPosition ? plane.lat : previous.confirmedLat,
      confirmedLon: result.isNewPosition ? plane.lon : previous.confirmedLon,
      confirmedAltitude: result.isNewPosition ? plane.altitude : previous.confirmedAltitude,
      confirmedTrack: result.isNewPosition ? plane.track : previous.confirmedTrack,
      confirmedGroundSpeed: result.isNewPosition ? plane.speed : previous.confirmedGroundSpeed,
      confirmedVerticalRate: result.isNewPosition ? plane.verticalRate : previous.confirmedVerticalRate,
      confirmedTimestamp: result.isNewPosition ? result.positionTimestamp : previous.confirmedTimestamp,
      confirmedSnapshotId: result.isNewPosition ? snapshotId : previous.confirmedSnapshotId
    }
  };
}

function runAppReplay(workerReplay) {
  const reports = [
    { report: recordedReports[0], snapshotId: workerReplay.first.upstreamSnapshotId },
    { report: recordedReports[1], snapshotId: workerReplay.changed.upstreamSnapshotId },
    { report: recordedReports[2], snapshotId: "recorded-snapshot-c" }
  ];
  let sequence = 0;
  let state = null;
  const trace = [];

  for (const [index, item] of reports.entries()) {
    const plane = appPlane(item.report, item.snapshotId);
    if (!state) {
      const first = classifyInternetPositionObservation(null, plane, item.snapshotId);
      sequence += 1;
      state = {
        sourceType: "internet",
        pendingPlane: plane,
        confirmedLat: plane.lat,
        confirmedLon: plane.lon,
        confirmedAltitude: plane.altitude,
        confirmedTrack: plane.track,
        confirmedGroundSpeed: plane.speed,
        confirmedVerticalRate: plane.verticalRate,
        confirmedTimestamp: first.positionTimestamp,
        confirmedSnapshotId: item.snapshotId
      };
      trace.push({ label: "A", sequence, reason: first.reason, mode: "CONFIRMED" });
    } else {
      const applied = applyObservation(state, plane, item.snapshotId, sequence);
      sequence = applied.sequence;
      state = applied.state;
      trace.push({ label: index === 1 ? "B" : "C", sequence, reason: applied.result.reason, mode: "CONFIRMED" });
    }

    const projected = projectConfirmedTraffic(state, state.confirmedTimestamp + 3_000);
    if (plane.altitude === "ground") assert.equal(projected, null);
    else {
      assert.ok(projected);
      assert.notDeepEqual({ lat: projected.lat, lon: projected.lon }, { lat: plane.lat, lon: plane.lon });
      trace.push({ label: `${index === 0 ? "A" : index === 1 ? "B" : "C"}+3s`, sequence, mode: "PREDICTED" });
    }

    const duplicate = applyObservation(state, plane, item.snapshotId, sequence);
    assert.equal(duplicate.result.isNewPosition, false);
    assert.equal(duplicate.sequence, sequence);
    assert.equal(duplicate.result.reason, "repeated snapshot ID");
    state = duplicate.state;
    trace.push({ label: `${index === 0 ? "A" : index === 1 ? "B" : "C"} duplicate`, sequence, reason: duplicate.result.reason });
  }

  assert.equal(sequence, 3);
  return trace;
}

function runLegacyV10Replay() {
  const initial = {
    pendingPlane: { lat: 33.5, lon: -113.42 },
    confirmedLat: 33.5,
    confirmedLon: -113.42,
    confirmedTimestamp: 1_787_275_923_464,
    confirmedSnapshotId: ""
  };
  const duplicateWithNewRetrievalTimestamp = classifyInternetPositionObservation(
    initial,
    { lat: 33.5, lon: -113.42, updatedAt: 1_787_275_930_464 },
    ""
  );
  assert.equal(duplicateWithNewRetrievalTimestamp.hasTrustworthyTimestamp, false);
  assert.equal(duplicateWithNewRetrievalTimestamp.isNewPosition, false);

  const movedWithNewRetrievalTimestamp = classifyInternetPositionObservation(
    initial,
    { lat: 33.499, lon: -113.40, updatedAt: 1_787_275_930_464 },
    ""
  );
  assert.equal(movedWithNewRetrievalTimestamp.isNewPosition, true);
  assert.equal(movedWithNewRetrievalTimestamp.reason, "coordinates changed without trustworthy source timestamp");
}

try {
  const workerReplay = await runWorkerReplay();
  await runZeroSeenPosReplay();
  const appTrace = runAppReplay(workerReplay);
  runLegacyV10Replay();
  console.log(
    JSON.stringify(
      {
        upstreamCalls,
        duplicateSnapshotStable: workerReplay.first.upstreamSnapshotId === workerReplay.duplicate.upstreamSnapshotId,
        duplicatePositionTimestampStable:
          workerReplay.first.aircraft[0].positionObservedAt === workerReplay.duplicate.aircraft[0].positionObservedAt,
        changedSnapshotDetected: workerReplay.first.upstreamSnapshotId !== workerReplay.changed.upstreamSnapshotId,
        workerObservationA: {
          snapshotId: workerReplay.first.upstreamSnapshotId,
          snapshotHash: workerReplay.first.upstreamSnapshotHash,
          rawSnapshotHash: workerReplay.first.upstreamRawSnapshotHash,
          lat: workerReplay.first.aircraft[0].lat,
          lon: workerReplay.first.aircraft[0].lon,
          positionObservedAt: workerReplay.first.aircraft[0].positionObservedAt,
          workerRetrievedAt: workerReplay.first.aircraft[0].workerRetrievedAt
        },
        workerObservationB: {
          snapshotId: workerReplay.changed.upstreamSnapshotId,
          snapshotHash: workerReplay.changed.upstreamSnapshotHash,
          rawSnapshotHash: workerReplay.changed.upstreamRawSnapshotHash,
          lat: workerReplay.changed.aircraft[0].lat,
          lon: workerReplay.changed.aircraft[0].lon,
          positionObservedAt: workerReplay.changed.aircraft[0].positionObservedAt,
          workerRetrievedAt: workerReplay.changed.aircraft[0].workerRetrievedAt
        },
        finalConfirmedSequence: 3,
        appTrace
      },
      null,
      2
    )
  );
} finally {
  Date.now = realDateNow;
  globalThis.fetch = realFetch;
  globalThis.caches = realCaches;
}
