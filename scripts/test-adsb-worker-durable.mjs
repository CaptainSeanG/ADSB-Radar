import assert from "node:assert/strict";

class MockKV {
  constructor() {
    this.store = new Map();
  }

  async get(key, type) {
    const record = this.store.get(key);
    if (!record) return null;
    if (record.expiresAt && Date.now() > record.expiresAt) return null;
    return type === "json" ? JSON.parse(record.value) : record.value;
  }

  async put(key, value, options = {}) {
    this.store.set(key, {
      value,
      expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null
    });
  }
}

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

  clearAircraft() {
    for (const key of this.store.keys()) {
      if (key.includes("/aircraft/")) this.store.delete(key);
    }
  }
}

const realDateNow = Date.now;
let fakeNow = Date.UTC(2026, 7, 14, 12, 0, 0);
Date.now = () => fakeNow;

const mockCache = new MockCache();
const durableKv = new MockKV();
globalThis.caches = { default: mockCache };

let upstreamMode = "success";
let upstreamCalls = 0;
globalThis.fetch = async (url) => {
  upstreamCalls += 1;
  if (upstreamMode === "fail") {
    return new Response("rate limited", { status: 429, headers: { "retry-after": "120" } });
  }

  return new Response(
    JSON.stringify({
      now: Math.floor(Date.now() / 1000),
      ac: [
        { hex: "near", flight: "NEAR1", lat: 33.50, lon: -112.07, seen: 0 },
        { hex: "mid", flight: "MID1", lat: 34.00, lon: -112.07, seen: 0 },
        { hex: "outside", flight: "OUT1", lat: 35.50, lon: -112.07, seen: 0 }
      ]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

async function loadWorker() {
  return (await import(`../workers/adsb-proxy.js?test=${Math.random()}`)).default;
}

async function request(worker, radius) {
  const response = await worker.fetch(
    new Request(`https://worker.test/api/aircraft?lat=33.45&lon=-112.07&radiusMiles=${radius}`),
    { ADSB_LKG_KV: durableKv },
    { waitUntil() {} }
  );
  return { status: response.status, body: await response.json() };
}

try {
  let worker = await loadWorker();
  let result = await request(worker, 20);
  assert.equal(result.status, 200);
  assert.equal(result.body.workerVersion, "2026-08-24-quota-protection-worker-v16");
  assert.equal(result.body.cacheRadiusMiles, 100);
  assert.equal(result.body.requestedRadiusMiles, 20);
  assert.equal(result.body.durableFallback, false);
  assert.deepEqual(result.body.aircraft.map((aircraft) => aircraft.hex), ["near"]);
  assert.equal(upstreamCalls, 1);

  const health = await worker.fetch(new Request("https://worker.test/health"), { ADSB_LKG_KV: durableKv }, {});
  const healthBody = await health.json();
  assert.equal(healthBody.durableSnapshotBindingConfigured, true);
  assert.equal(healthBody.durableSnapshotTtlSeconds, 86400);
  assert.equal(healthBody.trafficCacheCellDegrees, 0.25);
  assert.equal(healthBody.targetUpstreamRefreshSeconds, 6);

  mockCache.clearAircraft();
  upstreamMode = "fail";
  fakeNow += 7_000;
  worker = await loadWorker();
  result = await request(worker, 20);
  assert.equal(result.status, 200);
  assert.equal(result.body.stale, true);
  assert.equal(result.body.durableFallback, true);
  assert.equal(result.body.cacheRadiusMiles, 100);
  assert.equal(result.body.requestedRadiusMiles, 20);
  assert.equal(result.body.provider, "airplanes.live");
  assert.equal(result.body.total, 1);
  assert.deepEqual(result.body.aircraft.map((aircraft) => aircraft.hex), ["near"]);
  assert.ok(result.body.lastSuccessfulUpstreamFetch);
  assert.ok(Number.isFinite(result.body.dataAgeSeconds));

  result = await request(worker, 80);
  assert.equal(result.status, 200);
  assert.equal(result.body.durableFallback, true);
  assert.equal(result.body.cacheRadiusMiles, 100);
  assert.equal(result.body.requestedRadiusMiles, 80);
  assert.deepEqual(result.body.aircraft.map((aircraft) => aircraft.hex), ["near", "mid"]);

  fakeNow += 24 * 60 * 60 * 1000 + 1;
  worker = await loadWorker();
  result = await request(worker, 20);
  assert.equal(result.status, 502);
  assert.equal(result.body.durableFallback, false);

  console.log("ADSB Worker durable snapshot tests passed");
} finally {
  Date.now = realDateNow;
}
