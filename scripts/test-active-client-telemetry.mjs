import assert from "node:assert/strict";
import worker, { ActiveClientTelemetry, __test } from "../workers/adsb-proxy.js";

class MockStorage {
  constructor() {
    this.values = new Map();
    this.alarm = null;
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async getAlarm() {
    return this.alarm;
  }

  async setAlarm(value) {
    this.alarm = value;
  }
}

const storage = new MockStorage();
const state = {
  storage,
  blockConcurrencyWhile(operation) {
    return operation();
  }
};
const realNow = Date.now;
let now = Date.UTC(2026, 7, 23, 12, 0, 0);
Date.now = () => now;

async function observe(instance, clientId, source = "internet") {
  const response = await instance.fetch(new Request("https://active-clients.internal/observe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, version: "1.2 (6)", source })
  }));
  assert.equal(response.status, 200);
}

try {
  const telemetry = new ActiveClientTelemetry(state);
  await observe(telemetry, "11111111-1111-4111-8111-111111111111", "faa");
  await observe(telemetry, "11111111-1111-4111-8111-111111111111", "faa");
  await observe(telemetry, "22222222-2222-4222-8222-222222222222", "internet");

  let response = await telemetry.fetch(new Request("https://active-clients.internal/metrics"));
  let metrics = await response.json();
  assert.equal(metrics.activeClients2m, 2);
  assert.equal(metrics.activeClients15m, 2);
  assert.equal(metrics.activeClients1h, 2);
  assert.equal(metrics.requestsPerMinute, 3);
  assert.equal(metrics.sources.faaTais, 1);
  assert.equal(metrics.sources.internet, 1);

  await telemetry.alarm();
  const restored = new ActiveClientTelemetry(state);
  response = await restored.fetch(new Request("https://active-clients.internal/metrics"));
  metrics = await response.json();
  assert.equal(metrics.activeClients2m, 2);

  now += 3 * 60 * 1000;
  metrics = __test.activeClientMetrics(restored.clients, restored.requestBuckets, now);
  assert.equal(metrics.activeClients2m, 0);
  assert.equal(metrics.activeClients15m, 2);

  const metricsStub = {
    async fetch() {
      return new Response(JSON.stringify(metrics), { headers: { "content-type": "application/json" } });
    }
  };
  const env = {
    ADSB_ADMIN_TOKEN: "correct-token",
    ACTIVE_CLIENTS: {
      idFromName: (name) => name,
      get: () => metricsStub
    }
  };
  let admin = await worker.fetch(new Request("https://worker.test/admin/metrics"), env, {});
  assert.equal(admin.status, 401);
  admin = await worker.fetch(new Request("https://worker.test/admin/metrics", {
    headers: { authorization: "Bearer correct-token" }
  }), env, {});
  assert.equal(admin.status, 200);
  const adminMetrics = await admin.json();
  assert.equal(adminMetrics.activeClients15m, 2);
  assert.equal("clients" in adminMetrics, false);

  assert.equal(__test.normalizeAnonymousClientId("not valid"), "");
  assert.equal(__test.normalizeClientSource("STRATUS LIVE"), "local");
  assert.equal(await __test.tokenMatches("same", "same"), true);
  assert.equal(await __test.tokenMatches("wrong", "same"), false);

  console.log("Active-client telemetry tests passed.");
} finally {
  Date.now = realNow;
}
