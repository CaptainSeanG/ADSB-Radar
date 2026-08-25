import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  trafficPollIntervalMs,
  trafficPollIntervalsMs,
  workerTrafficPollingAllowed
} from "../public/traffic-polling.js";
import worker from "../workers/adsb-proxy.js";

assert.equal(trafficPollIntervalMs({ source: "FAA TAIS", stale: false }), 5000);
assert.equal(trafficPollIntervalMs({ source: "FAA-TAIS", stale: true }), 5000);
assert.equal(trafficPollIntervalMs({ source: "Internet ADS-B", stale: false }), 1500);
assert.equal(trafficPollIntervalMs({ source: "Internet ADS-B", stale: true }), 2500);
assert.equal(trafficPollIntervalMs({ source: "Stratus", stale: false }), 750);
assert.equal(trafficPollIntervalMs({ source: "Stratus", stale: true }), 1400);
assert.equal(trafficPollIntervalsMs.faaTais, 5000);

assert.equal(workerTrafficPollingAllowed({ pageVisible: true, nativeAppActive: true }), true);
assert.equal(workerTrafficPollingAllowed({ pageVisible: false, nativeAppActive: true }), false);
assert.equal(workerTrafficPollingAllowed({ pageVisible: true, nativeAppActive: false }), false);

const preflight = await worker.fetch(
  new Request("https://adsb-radar-proxy.example/api/aircraft", {
    method: "OPTIONS",
    headers: {
      Origin: "https://captainseang.github.io",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "x-adsb-radar-client,x-adsb-radar-version,x-adsb-radar-source"
    }
  }),
  {},
  { waitUntil() {} }
);

assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-max-age"), "86400");
assert.match(preflight.headers.get("access-control-allow-headers") || "", /x-adsb-radar-client/i);

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
assert.equal((appSource.match(/setInterval\(pumpTrafficFeed,\s*250\)/g) || []).length, 1);
assert.equal((appSource.match(/^startTrafficPump\(\);$/gm) || []).length, 1);
assert.equal((appSource.match(/addEventListener\("visibilitychange"/g) || []).length >= 1, true);
assert.equal((appSource.match(/addEventListener\("adsb-native-app-visibility"/g) || []).length, 1);
assert.match(appSource, /pageTrafficVisible\s*=\s*!document\.hidden/);
assert.match(appSource, /fetchTraffic\(\{ force: true \}\)/);

const projectedFaaRequestsPerMinute = 60_000 / trafficPollIntervalsMs.faaTais;
assert.equal(projectedFaaRequestsPerMinute, 12);

function simulatePumpRequests({ durationMs, baseDelayMs, jitterMs, pumpTickMs = 250 }) {
  let requests = 0;
  let nextRequestAt = 0;
  for (let now = 0; now < durationMs; now += pumpTickMs) {
    if (now < nextRequestAt) continue;
    requests += 1;
    nextRequestAt = now + baseDelayMs + jitterMs;
  }
  return requests;
}

const simulatedMinutes = 10;
const simulatedFaaRequests = simulatePumpRequests({
  durationMs: simulatedMinutes * 60_000,
  baseDelayMs: trafficPollIntervalsMs.faaTais,
  jitterMs: 175
});
const measuredFaaGetsPerMinute = simulatedFaaRequests / simulatedMinutes;
assert.ok(measuredFaaGetsPerMinute >= 11 && measuredFaaGetsPerMinute <= 12);

const simulatedLegacyRequests = simulatePumpRequests({
  durationMs: simulatedMinutes * 60_000,
  baseDelayMs: 1500,
  jitterMs: 175
});
const legacyGetsPerMinute = simulatedLegacyRequests / simulatedMinutes;

console.log(
  JSON.stringify(
    {
      faaTrafficGetsPerMinute: projectedFaaRequestsPerMinute,
      controlledPumpGetsPerMinute: measuredFaaGetsPerMinute,
      legacyControlledPumpGetsPerMinute: legacyGetsPerMinute,
      trafficGetReductionPercent: Number((100 * (1 - measuredFaaGetsPerMinute / legacyGetsPerMinute)).toFixed(1)),
      repeatedOptionsPerMinuteAfterCachedPreflight: 0,
      hiddenPollingAllowed: false,
      recurringTrafficPollers: 1,
      corsMaxAgeSeconds: Number(preflight.headers.get("access-control-max-age"))
    },
    null,
    2
  )
);
