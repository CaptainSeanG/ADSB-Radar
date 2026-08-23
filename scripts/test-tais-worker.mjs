import assert from "node:assert/strict";
import { __test } from "../workers/adsb-proxy.js";

assert.equal(__test.taisCoverageEligible(33.45, -112.07), true);
assert.equal(__test.taisCoverageEligible(34.0522, -118.2437), false);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /lat=33\.45/);
  assert.equal(options.headers.authorization, "Bearer test-token");
  return new Response(JSON.stringify({
    source: "FAA TAIS",
    displaySource: "FAA TAIS",
    provider: "faa-tais-p50",
    coverageEligible: true,
    receiverState: "live",
    stale: false,
    dataTimestamp: "2026-08-21T21:46:39.372Z",
    upstreamSnapshotId: "sample-snapshot",
    aircraft: [{
      hex: "a65405",
      lat: 33.3565,
      lon: -112.47764,
      positionObservedAt: 1787348799372,
      positionTimestampTrusted: true,
      speed: null,
      track: null
    }],
    total: 1,
    gateway: {
      connectionState: "live",
      lastMessageAgeSeconds: 0.5,
      messagesPerSecond: 3.2,
      activeTracks: 90
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
};

try {
  const result = await __test.fetchTaisGateway(
    { TAIS_GATEWAY_URL: "https://tais.example.test", TAIS_GATEWAY_TOKEN: "test-token" },
    33.45,
    -112.07,
    100,
    { force: true }
  );
  assert.equal(result.ok, true);
  assert.equal(result.payload.displaySource, "FAA TAIS");
  assert.equal(result.payload.aircraft[0].speed, null);
  assert.equal(result.payload.aircraft[0].track, null);
  assert.equal(result.payload.aircraft[0].positionTimestampTrusted, true);
  assert.equal(result.payload.tais.selected, true);

  const outside = await __test.fetchTaisGateway(
    { TAIS_GATEWAY_URL: "https://tais.example.test", TAIS_GATEWAY_TOKEN: "test-token" },
    34.0522,
    -118.2437,
    100,
    { force: true }
  );
  assert.equal(outside.ok, false);
  assert.equal(outside.coverageEligible, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("TAIS Worker gate/normalization tests passed.");
