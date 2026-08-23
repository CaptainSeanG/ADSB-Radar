import assert from "node:assert/strict";
import {
  INTERNET_PREDICTION_HORIZON_SECONDS,
  destinationPointMiles,
  distanceMilesBetween,
  projectConfirmedTraffic
} from "../public/traffic-prediction.js";

const start = Date.UTC(2026, 7, 20, 12, 0, 0);
const confirmed = {
  sourceType: "internet",
  confirmedLat: 33.45,
  confirmedLon: -112.07,
  confirmedAltitude: 8000,
  confirmedTrack: 90,
  confirmedGroundSpeed: 180,
  confirmedVerticalRate: 600,
  confirmedTimestamp: start
};

const midpoint = projectConfirmedTraffic(confirmed, start + 3000);
assert.ok(midpoint);
assert.equal(midpoint.predictionAgeSeconds, 3);
assert.ok(midpoint.lon > confirmed.confirmedLon);
assert.ok(Math.abs(midpoint.altitude - 8030) < 0.01);
assert.equal(projectConfirmedTraffic(confirmed, start + 6001), null);
assert.equal(projectConfirmedTraffic({ ...confirmed, sourceType: "stratus" }, start + 3000), null);
assert.equal(projectConfirmedTraffic({ ...confirmed, confirmedAltitude: "ground" }, start + 3000), null);
assert.equal(projectConfirmedTraffic({ ...confirmed, confirmedTrack: null }, start + 3000), null);
assert.equal(projectConfirmedTraffic({ ...confirmed, confirmedGroundSpeed: null }, start + 3000), null);

const originalCoordinates = { lat: confirmed.confirmedLat, lon: confirmed.confirmedLon };
projectConfirmedTraffic(confirmed, start + 3000);
assert.deepEqual(
  { lat: confirmed.confirmedLat, lon: confirmed.confirmedLon },
  originalCoordinates,
  "projection must not mutate confirmed coordinates"
);

const durationSeconds = 10 * 60;
const clientPollSeconds = 1.5;
const upstreamCadenceSeconds = 6;
const sweepSeconds = 3.4;
let confirmedReports = 0;
let predictedSweeps = 0;
let confirmedSweeps = 0;
let maxCorrectionMeters = 0;
const reports = [];
let truthPosition = { lat: confirmed.confirmedLat, lon: confirmed.confirmedLon };

for (let second = 0; second <= durationSeconds; second += upstreamCadenceSeconds) {
  const report = {
    ...confirmed,
    confirmedLat: truthPosition.lat,
    confirmedLon: truthPosition.lon,
    confirmedAltitude: confirmed.confirmedAltitude + (confirmed.confirmedVerticalRate * second) / 60,
    confirmedTimestamp: start + second * 1000
  };
  reports.push(report);
  confirmedReports += 1;

  if (second > 0) {
    const projected = projectConfirmedTraffic(reports.at(-2), start + second * 1000);
    assert.ok(projected);
    maxCorrectionMeters = Math.max(
      maxCorrectionMeters,
      distanceMilesBetween(projected.lat, projected.lon, report.confirmedLat, report.confirmedLon) * 1609.344
    );
  }

  truthPosition = destinationPointMiles(
    truthPosition.lat,
    truthPosition.lon,
    confirmed.confirmedTrack,
    (confirmed.confirmedGroundSpeed / 3600) * upstreamCadenceSeconds * 1.15078
  );
}

for (let second = 0; second <= durationSeconds; second += sweepSeconds) {
  const latestReportIndex = Math.floor(second / upstreamCadenceSeconds);
  const latestReportSecond = latestReportIndex * upstreamCadenceSeconds;
  const state = reports[Math.min(latestReportIndex, reports.length - 1)];
  const age = second - latestReportSecond;
  if (age < 0.25) confirmedSweeps += 1;
  else if (projectConfirmedTraffic(state, start + second * 1000)) predictedSweeps += 1;
}

const clientRequests = Math.floor(durationSeconds / clientPollSeconds) + 1;
assert.equal(INTERNET_PREDICTION_HORIZON_SECONDS, 6);
assert.equal(confirmedReports, 101);
assert.ok(predictedSweeps > confirmedSweeps);
assert.ok(maxCorrectionMeters < 0.1);

console.log(
  JSON.stringify(
    {
      simulatedMinutes: 10,
      clientPollSeconds,
      radarSweepSeconds: sweepSeconds,
      upstreamCadenceSeconds,
      clientRequests,
      upstreamRequests: confirmedReports,
      upstreamRequestsAvoided: clientRequests - confirmedReports,
      confirmedSweeps,
      predictedSweeps,
      maxConstantTrackCorrectionMeters: Number(maxCorrectionMeters.toFixed(3))
    },
    null,
    2
  )
);
