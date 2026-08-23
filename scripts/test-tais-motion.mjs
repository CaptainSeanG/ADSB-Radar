import assert from "node:assert/strict";
import {
  deriveConfirmedMotion,
  destinationPointMiles,
  distanceMilesBetween,
  projectConfirmedTraffic,
  trafficSymbolScreenAngleDegrees
} from "../public/traffic-prediction.js";
import { classifyInternetPositionObservation } from "../public/traffic-ingestion.js";

const start = Date.UTC(2026, 7, 21, 20, 0, 0);
const origin = { lat: 33.45, lon: -112.07 };
const eastPosition = destinationPointMiles(origin.lat, origin.lon, 90, 0.115078);
const northPosition = destinationPointMiles(eastPosition.lat, eastPosition.lon, 0, 0.115078);

const firstState = {
  sourceType: "faa",
  confirmedLat: origin.lat,
  confirmedLon: origin.lon,
  confirmedAltitude: 8000,
  confirmedTimestamp: start,
  confirmedTrack: null,
  confirmedGroundSpeed: null
};
const eastPlane = {
  hex: "a12345",
  lat: eastPosition.lat,
  lon: eastPosition.lon,
  altitude: 8000,
  positionObservedAt: start + 5000,
  positionTimestampTrusted: true
};

const eastMotion = deriveConfirmedMotion(firstState, eastPlane, eastPlane.positionObservedAt);
assert.equal(eastMotion.accepted, true);
assert.ok(Math.abs(eastMotion.track - 90) < 0.1);
assert.ok(Math.abs(eastMotion.groundspeed - 72) < 0.2);

const eastState = {
  sourceType: "faa",
  confirmedLat: eastPlane.lat,
  confirmedLon: eastPlane.lon,
  confirmedAltitude: eastPlane.altitude,
  confirmedTimestamp: eastPlane.positionObservedAt,
  confirmedTrack: eastMotion.track,
  confirmedGroundSpeed: eastMotion.groundspeed,
  derivedTrack: eastMotion.track,
  derivedGroundSpeed: eastMotion.groundspeed
};
const predictedEast = projectConfirmedTraffic(eastState, start + 8000);
assert.ok(predictedEast);
assert.ok(predictedEast.lon > eastPlane.lon, "mid-sweep prediction should advance east");
assert.equal(eastState.confirmedLon, eastPlane.lon, "prediction must not mutate confirmed state");

const northPlane = {
  ...eastPlane,
  lat: northPosition.lat,
  lon: northPosition.lon,
  positionObservedAt: start + 10000
};
const northMotion = deriveConfirmedMotion(eastState, northPlane, northPlane.positionObservedAt);
assert.equal(northMotion.accepted, true);
assert.ok(northMotion.track < 0.1 || northMotion.track > 359.9);
const oldTrackProjection = projectConfirmedTraffic(eastState, northPlane.positionObservedAt);
assert.ok(oldTrackProjection);
assert.ok(
  distanceMilesBetween(oldTrackProjection.lat, oldTrackProjection.lon, northPlane.lat, northPlane.lon) > 0.1,
  "turn confirmation should correct the old predicted path immediately"
);

const northState = {
  ...eastState,
  confirmedLat: northPlane.lat,
  confirmedLon: northPlane.lon,
  confirmedTimestamp: northPlane.positionObservedAt,
  confirmedTrack: northMotion.track,
  confirmedGroundSpeed: northMotion.groundspeed
};
const predictedNorth = projectConfirmedTraffic(northState, start + 13000);
assert.ok(predictedNorth.lat > northPlane.lat);

const duplicate = classifyInternetPositionObservation(
  { ...eastState, pendingPlane: eastPlane, confirmedSnapshotId: "tais-a" },
  eastPlane,
  "tais-a"
);
assert.equal(duplicate.isNewPosition, false);
assert.equal(duplicate.reason, "repeated snapshot ID");
const duplicateMotion = deriveConfirmedMotion(eastState, eastPlane, eastPlane.positionObservedAt);
assert.equal(duplicateMotion.accepted, false);
assert.equal(duplicateMotion.reason, "timestamp did not advance");

const recycledTrackMotion = deriveConfirmedMotion(null, {
  ...eastPlane,
  hex: "tais-P50-747-g2"
}, start + 20000);
assert.equal(recycledTrackMotion.accepted, false);
assert.equal(recycledTrackMotion.track, null, "a recycled track must not inherit orientation");
assert.equal(recycledTrackMotion.groundspeed, null, "a recycled track must not inherit velocity");

assert.equal(trafficSymbolScreenAngleDegrees(90, 0), 0, "east points right in north-up mode");
assert.equal(trafficSymbolScreenAngleDegrees(90, 90), -90, "east points forward when radar is east-up");
assert.equal(trafficSymbolScreenAngleDegrees(null, 0), null, "unknown track stays nondirectional");

console.log(JSON.stringify({
  straightTrackDegrees: Number(eastMotion.track.toFixed(2)),
  straightGroundspeedKts: Number(eastMotion.groundspeed.toFixed(2)),
  turnTrackDegrees: Number(northMotion.track.toFixed(2)),
  correctionMeters: Number(
    (distanceMilesBetween(oldTrackProjection.lat, oldTrackProjection.lon, northPlane.lat, northPlane.lon) * 1609.344).toFixed(1)
  ),
  duplicateRejected: true,
  recycledTrackInheritedMotion: false
}, null, 2));
