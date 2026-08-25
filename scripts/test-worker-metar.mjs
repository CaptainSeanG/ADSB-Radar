import assert from "node:assert/strict";
import worker from "../workers/adsb-proxy.js";

const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (request) => {
  const url = String(request);
  if (!url.startsWith("https://aviationweather.gov/api/data/metar")) return originalFetch(request);
  requests += 1;
  return new Response(JSON.stringify([{
    icaoId: "KTST",
    wdir: 270,
    wspd: 12,
    wgst: 18,
    rawOb: "METAR KTST 232000Z 27012G18KT 10SM CLR"
  }]), { status: 200, headers: { "content-type": "application/json" } });
};

try {
  const first = await worker.fetch(new Request("https://worker.test/api/metar?id=KTST"), {}, {});
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.report.wdir, 270);
  assert.equal(firstBody.source, "AviationWeather.gov");
  assert.equal(firstBody.workerVersion, "2026-08-24-quota-protection-worker-v16");

  const second = await worker.fetch(new Request("https://worker.test/api/metar?id=KTST"), {}, {});
  assert.equal(second.status, 200);
  assert.equal(requests, 1, "same-station METAR requests should use the 60-second Worker cache");

  const bad = await worker.fetch(new Request("https://worker.test/api/metar?id=INVALID"), {}, {});
  assert.equal(bad.status, 400);
  console.log("Worker METAR proxy tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
