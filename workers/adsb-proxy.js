const SOURCES = [
  {
    name: "airplanes.live",
    base: "https://api.airplanes.live/v2",
    path: "point",
    minRefreshMs: 6000,
    forbiddenCooldownMs: 6 * 60 * 60 * 1000
  },
  {
    name: "adsb.lol",
    base: "https://api.adsb.lol/v2",
    path: "latlon",
    minRefreshMs: 6000,
    forbiddenCooldownMs: 6 * 60 * 60 * 1000
  },
  {
    name: "adsb.fi",
    base: "https://opendata.adsb.fi/api/v3",
    path: "latlon",
    minRefreshMs: 6000,
    forbiddenCooldownMs: 6 * 60 * 60 * 1000
  }
];
const VERSION = "2026-08-24-quota-protection-worker-v16";
const CACHE_TTL_SECONDS = 2;
const TARGET_UPSTREAM_REFRESH_MS = 6000;
const UPSTREAM_TIMEOUT_MS = 6500;
const STALE_AFTER_SECONDS = 45;
const MAX_STALE_SECONDS = 30 * 60;
const MAX_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const TRAFFIC_RADIUS_BUCKETS_MILES = [100, 250];
const TRAFFIC_CACHE_CELL_DEGREES = 0.25;
const TRAFFIC_CELL_EDGE_BUFFER_MILES = 15;
const DURABLE_SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;
const DURABLE_SNAPSHOT_SCHEMA_VERSION = 1;
const TAIS_COVERAGE_CENTER = { lat: 33.4342, lon: -112.0116 };
const TAIS_COVERAGE_RADIUS_MILES = 125;
const TAIS_TIMEOUT_MS = 1200;
const TAIS_RETRY_MS = 5000;
const ACTIVE_CLIENT_RETENTION_MS = 60 * 60 * 1000;
const ACTIVE_CLIENT_FLUSH_MS = 30 * 1000;
const ACTIVE_CLIENT_STORAGE_KEY = "active-clients-v1";
const ACTIVE_CLIENT_OBJECT_NAME = "global";
const METAR_CACHE_MS = 60 * 1000;
const METAR_STALE_MS = 15 * 60 * 1000;
const aircraftCache = new Map();
const refreshFlights = new Map();
const providerHealth = new Map();
const taisFlights = new Map();
const taisResults = new Map();
let taisLastAttemptAt = 0;
let taisLastResult = null;
const metarCache = new Map();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-adsb-radar-client, x-adsb-radar-version, x-adsb-radar-source",
  "access-control-max-age": "86400",
  "cache-control": "no-store"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" }
  });

const num = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nm = (miles) => miles * 0.868976;

function nowMs() {
  return Date.now();
}

function normalizeAnonymousClientId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(candidate) ? candidate : "";
}

function normalizeClientSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (source.includes("faa")) return "faaTais";
  if (source.includes("stratus") || source.includes("wifi")) return "local";
  if (source.includes("stale")) return "stale";
  if (source.includes("internet") || source.includes("cellular")) return "internet";
  if (source.includes("none") || source.includes("no-data") || source.includes("unavailable")) return "noData";
  return "unknown";
}

function activeClientMetrics(clients, requestBuckets, at = nowMs()) {
  const records = Array.from(clients instanceof Map ? clients.values() : clients || []);
  const active = (windowMs) => records.filter((record) => at - Number(record.lastSeenAt || 0) <= windowMs);
  const active2m = active(2 * 60 * 1000);
  const active15m = active(15 * 60 * 1000);
  const active1h = active(ACTIVE_CLIENT_RETENTION_MS);
  const sources = { faaTais: 0, local: 0, internet: 0, stale: 0, noData: 0, unknown: 0 };
  for (const record of active2m) sources[normalizeClientSource(record.source)] += 1;
  const currentMinute = Math.floor(at / 60000);
  const requestsPerMinute = Number(requestBuckets instanceof Map ? requestBuckets.get(currentMinute) || 0 : requestBuckets?.[currentMinute] || 0);
  return {
    activeClients2m: active2m.length,
    activeClients15m: active15m.length,
    activeClients1h: active1h.length,
    requestsPerMinute,
    sources,
    generatedAt: new Date(at).toISOString()
  };
}

export class ActiveClientTelemetry {
  constructor(state) {
    this.state = state;
    this.clients = new Map();
    this.requestBuckets = new Map();
    this.dirty = false;
    const load = async () => {
      const stored = await this.state.storage.get(ACTIVE_CLIENT_STORAGE_KEY);
      for (const record of stored?.clients || []) {
        const id = normalizeAnonymousClientId(record?.id);
        if (id) this.clients.set(id, { ...record, id });
      }
      for (const [minute, count] of stored?.requestBuckets || []) {
        this.requestBuckets.set(Number(minute), Number(count));
      }
      this.prune(nowMs());
    };
    this.ready = this.state.blockConcurrencyWhile ? this.state.blockConcurrencyWhile(load) : load();
  }

  prune(at) {
    for (const [id, record] of this.clients) {
      if (at - Number(record.lastSeenAt || 0) > ACTIVE_CLIENT_RETENTION_MS) this.clients.delete(id);
    }
    const oldestMinute = Math.floor((at - ACTIVE_CLIENT_RETENTION_MS) / 60000);
    for (const minute of this.requestBuckets.keys()) {
      if (minute < oldestMinute) this.requestBuckets.delete(minute);
    }
  }

  async scheduleFlush(at) {
    if (!this.state.storage.setAlarm) return;
    const existing = this.state.storage.getAlarm ? await this.state.storage.getAlarm() : null;
    if (!existing) await this.state.storage.setAlarm(at + ACTIVE_CLIENT_FLUSH_MS);
  }

  async persist(at = nowMs()) {
    this.prune(at);
    await this.state.storage.put(ACTIVE_CLIENT_STORAGE_KEY, {
      schemaVersion: 1,
      clients: Array.from(this.clients.values()),
      requestBuckets: Array.from(this.requestBuckets.entries()),
      updatedAt: at
    });
    this.dirty = false;
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === "/observe" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const id = normalizeAnonymousClientId(payload.clientId);
      if (!id) return json({ error: "Invalid anonymous client identifier" }, 400);
      const at = nowMs();
      this.prune(at);
      this.clients.set(id, {
        id,
        lastSeenAt: at,
        version: String(payload.version || "").slice(0, 64),
        source: normalizeClientSource(payload.source)
      });
      const minute = Math.floor(at / 60000);
      this.requestBuckets.set(minute, Number(this.requestBuckets.get(minute) || 0) + 1);
      this.dirty = true;
      await this.scheduleFlush(at);
      return json({ ok: true });
    }
    if (url.pathname === "/metrics") {
      return json(activeClientMetrics(this.clients, this.requestBuckets));
    }
    return json({ error: "Not found" }, 404);
  }

  async alarm() {
    await this.ready;
    if (this.dirty) await this.persist();
  }
}

function activeClientStub(env) {
  if (!env?.ACTIVE_CLIENTS?.idFromName || !env?.ACTIVE_CLIENTS?.get) return null;
  return env.ACTIVE_CLIENTS.get(env.ACTIVE_CLIENTS.idFromName(ACTIVE_CLIENT_OBJECT_NAME));
}

async function recordActiveClient(request, env) {
  const clientId = normalizeAnonymousClientId(request.headers.get("x-adsb-radar-client"));
  const stub = activeClientStub(env);
  if (!clientId || !stub) return;
  await stub.fetch("https://active-clients.internal/observe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId,
      version: request.headers.get("x-adsb-radar-version") || "",
      source: request.headers.get("x-adsb-radar-source") || "unknown"
    })
  });
}

async function tokenMatches(supplied, expected) {
  if (!supplied || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

async function adminMetrics(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!(await tokenMatches(supplied, String(env?.ADSB_ADMIN_TOKEN || "")))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const stub = activeClientStub(env);
  if (!stub) return json({ error: "Active-client telemetry is not configured" }, 503);
  const response = await stub.fetch("https://active-clients.internal/metrics");
  const telemetry = await response.json();
  return json({
    ...telemetry,
    workerVersion: VERSION,
    tais: taisLastResult
      ? {
          state: taisLastResult.state || "unavailable",
          selected: Boolean(taisLastResult.ok),
          lastAttemptAgeSeconds: secondsSince(taisLastAttemptAt),
          activeTracks: taisLastResult.gateway?.activeTracks ?? null
        }
      : null,
    providerHealth: providerHealthSummary()
  });
}

async function handleMetar(url) {
  const station = String(url.searchParams.get("id") || url.searchParams.get("ids") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(station)) return json({ error: "A valid METAR station identifier is required" }, 400);
  const now = nowMs();
  const cached = metarCache.get(station);
  if (cached && now - cached.fetchedAt < METAR_CACHE_MS) {
    return json({ ...cached.payload, cacheAgeSeconds: Math.round((now - cached.fetchedAt) / 1000), stale: false });
  }

  try {
    const endpoint = new URL("https://aviationweather.gov/api/data/metar");
    endpoint.searchParams.set("ids", station);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "ADSB-Radar airport information (captainseang.github.io/ADSB-Radar)"
      }
    });
    if (!response.ok) throw new Error(`AviationWeather.gov returned ${response.status}`);
    const reports = await response.json();
    const report = Array.isArray(reports) ? reports[0] || null : null;
    const payload = {
      station,
      report,
      source: "AviationWeather.gov",
      fetchedAt: new Date(now).toISOString(),
      cacheAgeSeconds: 0,
      stale: false,
      workerVersion: VERSION
    };
    metarCache.set(station, { fetchedAt: now, payload });
    return json(payload);
  } catch (error) {
    if (cached && now - cached.fetchedAt < METAR_STALE_MS) {
      return json({
        ...cached.payload,
        cacheAgeSeconds: Math.round((now - cached.fetchedAt) / 1000),
        stale: true,
        warning: error?.message || "Current METAR unavailable"
      });
    }
    return json({
      station,
      report: null,
      source: "AviationWeather.gov",
      stale: true,
      error: error?.message || "Current METAR unavailable",
      workerVersion: VERSION
    }, 502);
  }
}

function miles(aLat, aLon, bLat, bLon) {
  const earth = 3958.7613;
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

function taisCoverageEligible(lat, lon) {
  return miles(lat, lon, TAIS_COVERAGE_CENTER.lat, TAIS_COVERAGE_CENTER.lon) <= TAIS_COVERAGE_RADIUS_MILES;
}

function taisConfiguration(env) {
  const baseUrl = String(env?.TAIS_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const token = String(env?.TAIS_GATEWAY_TOKEN || "").trim();
  return { baseUrl, token, configured: Boolean(baseUrl && token) };
}

function taisFallbackMetadata(attempt) {
  return {
    coverageEligible: Boolean(attempt?.coverageEligible),
    configured: Boolean(attempt?.configured),
    selected: false,
    state: attempt?.state || "unavailable",
    fallbackReason: attempt?.reason || "FAA TAIS was not selected",
    httpStatus: attempt?.status ?? null,
    lastMessageAgeSeconds: attempt?.gateway?.lastMessageAgeSeconds ?? null,
    messagesPerSecond: attempt?.gateway?.messagesPerSecond ?? null,
    activeTracks: attempt?.gateway?.activeTracks ?? null
  };
}

function withTaisFallback(payload, attempt) {
  return attempt?.coverageEligible ? { ...payload, tais: taisFallbackMetadata(attempt) } : payload;
}

async function fetchTaisGateway(env, lat, lon, requestedRadiusMiles, { force = false } = {}) {
  const coverageEligible = taisCoverageEligible(lat, lon);
  const config = taisConfiguration(env);
  if (!coverageEligible) return { ok: false, coverageEligible, configured: config.configured, reason: "outside P50 coverage gate" };
  if (!config.configured) return { ok: false, coverageEligible, configured: false, reason: "TAIS gateway is not configured" };

  const requestKey = `${Number(lat).toFixed(3)}:${Number(lon).toFixed(3)}:${Number(requestedRadiusMiles).toFixed(1)}`;
  const at = nowMs();
  const cachedResult = taisResults.get(requestKey);
  if (!force && cachedResult && at - cachedResult.at < TAIS_RETRY_MS) return cachedResult.result;
  if (taisFlights.has(requestKey)) return taisFlights.get(requestKey);

  taisLastAttemptAt = at;
  const flight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TAIS_TIMEOUT_MS);
    try {
      const url = new URL(`${config.baseUrl}/api/aircraft`);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("radiusMiles", String(requestedRadiusMiles));
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", authorization: `Bearer ${config.token}` }
      });
      const data = await response.json().catch(() => ({}));
      const gateway = data.gateway || {};
      const live =
        response.ok &&
        data.coverageEligible !== false &&
        data.stale !== true &&
        String(data.receiverState || gateway.connectionState || "").toLowerCase() === "live" &&
        Array.isArray(data.aircraft);
      if (!live) {
        return {
          ok: false,
          coverageEligible,
          configured: true,
          status: response.status,
          state: data.receiverState || gateway.connectionState || "unavailable",
          gateway,
          reason: data.error || data.warning || `TAIS gateway returned HTTP ${response.status}`
        };
      }

      const workerResponseAt = nowMs();
      return {
        ok: true,
        coverageEligible,
        configured: true,
        status: response.status,
        state: "live",
        gateway,
        payload: {
          ...data,
          source: "FAA TAIS",
          displaySource: "FAA TAIS",
          provider: "faa-tais-p50",
          stale: false,
          requestedRadiusMiles,
          workerVersion: VERSION,
          workerResponseTimestamp: new Date(workerResponseAt).toISOString(),
          tais: {
            coverageEligible: true,
            configured: true,
            selected: true,
            state: "live",
            fallbackReason: "",
            lastMessageAgeSeconds: gateway.lastMessageAgeSeconds ?? null,
            messagesPerSecond: gateway.messagesPerSecond ?? null,
            activeTracks: gateway.activeTracks ?? data.total ?? data.aircraft.length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        coverageEligible,
        configured: true,
        status: error?.name === "AbortError" ? "timeout" : "network-error",
        state: "unavailable",
        gateway: null,
        reason: error?.name === "AbortError" ? "TAIS gateway timed out" : `TAIS gateway unavailable: ${error?.message || error}`
      };
    } finally {
      clearTimeout(timeout);
    }
  })();
  taisFlights.set(requestKey, flight);

  try {
    taisLastResult = await flight;
    taisResults.set(requestKey, { at: nowMs(), result: taisLastResult });
    return taisLastResult;
  } finally {
    taisFlights.delete(requestKey);
  }
}

function cacheRadiusMilesFor(radiusMiles) {
  const requested = Math.max(1, Math.min(250, Number(radiusMiles) || 15));
  return TRAFFIC_RADIUS_BUCKETS_MILES.find((bucket) => requested <= bucket) || TRAFFIC_RADIUS_BUCKETS_MILES.at(-1);
}

function trafficCellFor(lat, lon) {
  const latIndex = Math.round(Number(lat) / TRAFFIC_CACHE_CELL_DEGREES);
  const lonIndex = Math.round(Number(lon) / TRAFFIC_CACHE_CELL_DEGREES);
  return {
    latIndex,
    lonIndex,
    lat: latIndex * TRAFFIC_CACHE_CELL_DEGREES,
    lon: lonIndex * TRAFFIC_CACHE_CELL_DEGREES
  };
}

function upstreamRadiusMilesFor(cacheRadiusMiles) {
  return Math.min(250, Number(cacheRadiusMiles) + TRAFFIC_CELL_EDGE_BUFFER_MILES);
}

function cacheKey(cell, cacheRadiusMiles) {
  return `cell-v2:${cell.latIndex}:${cell.lonIndex}:${Math.round(cacheRadiusMiles * 10) / 10}`;
}

function durableSnapshotKey(key) {
  return `aircraft:lkg:${key}`;
}

function cacheRequest(key) {
  return new Request(`https://adsb-radar-cache.local/aircraft/${encodeURIComponent(key)}`);
}

function providerCacheRequest(sourceName) {
  return new Request(`https://adsb-radar-cache.local/provider/${encodeURIComponent(sourceName)}`);
}

async function readSharedCache(key) {
  const memoryEntry = aircraftCache.get(key);
  if (memoryEntry) {
    memoryEntry.key = key;
    return memoryEntry;
  }

  const cachedResponse = await caches.default.match(cacheRequest(key));
  if (!cachedResponse) return null;
  try {
    const entry = await cachedResponse.json();
    entry.key = key;
    aircraftCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

async function writeSharedCache(key, entry) {
  entry.key = key;
  aircraftCache.set(key, entry);
  await caches.default.put(
    cacheRequest(key),
    new Response(JSON.stringify(entry), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${MAX_STALE_SECONDS}`
      }
    })
  );
}

async function readDurableSnapshot(env, key, at = nowMs()) {
  const namespace = env?.ADSB_LKG_KV;
  if (!namespace?.get) return null;

  try {
    const stored = await namespace.get(durableSnapshotKey(key), "json");
    if (!stored || stored.schemaVersion !== DURABLE_SNAPSHOT_SCHEMA_VERSION) return null;
    const receivedAt = Number(stored.workerReceivedAt || stored.cachedAt || 0);
    if (!Number.isFinite(receivedAt) || at - receivedAt > DURABLE_SNAPSHOT_TTL_SECONDS * 1000) return null;
    if (!stored.payload || !Array.isArray(stored.payload.aircraft)) return null;
    return {
      key,
      payload: stored.payload,
      cacheRadiusMiles: stored.cacheRadiusMiles,
      cachedAt: receivedAt,
      lastRefreshAttemptAt: stored.lastRefreshAttemptAt || receivedAt,
      lastRefreshSuccessAt: stored.lastSuccessfulUpstreamFetch || receivedAt,
      upstreamFailures: stored.upstreamFailures || [],
      warning: "ADS-B upstream unavailable; serving durable last-known-good traffic snapshot.",
      durableSnapshot: true,
      durableStoredAt: receivedAt
    };
  } catch (error) {
    console.log(`ADS-B durable snapshot read failed for ${key}: ${error?.message || error}`);
    return null;
  }
}

async function writeDurableSnapshot(env, key, entry) {
  const namespace = env?.ADSB_LKG_KV;
  if (!namespace?.put || !entry?.payload || !Array.isArray(entry.payload.aircraft)) return;

  const snapshot = {
    schemaVersion: DURABLE_SNAPSHOT_SCHEMA_VERSION,
    normalizedKey: key,
    cacheRadiusMiles: entry.cacheRadiusMiles,
    provider: entry.payload.provider || entry.payload.source || null,
    targetCount: entry.payload.aircraft.length,
    payload: entry.payload,
    upstreamDataTimestamp: entry.payload.dataTimestamp || normalizeDataTimestamp(entry.payload.now, entry.cachedAt),
    workerReceivedAt: entry.cachedAt,
    lastSuccessfulUpstreamFetch: entry.lastRefreshSuccessAt || entry.cachedAt,
    lastRefreshAttemptAt: entry.lastRefreshAttemptAt || entry.cachedAt,
    storedAt: nowMs()
  };

  try {
    await namespace.put(durableSnapshotKey(key), JSON.stringify(snapshot), {
      expirationTtl: DURABLE_SNAPSHOT_TTL_SECONDS
    });
  } catch (error) {
    console.log(`ADS-B durable snapshot write failed for ${key}: ${error?.message || error}`);
  }
}

async function hydrateProviderState(source) {
  const state = providerState(source);
  const cachedResponse = await caches.default.match(providerCacheRequest(source.name));
  if (!cachedResponse) return state;

  try {
    const cached = await cachedResponse.json();
    if (Number(cached.updatedAt || 0) >= Number(state.updatedAt || 0)) {
      Object.assign(state, cached);
    }
  } catch {
    // Ignore malformed shared health; the in-memory state is still usable.
  }
  return state;
}

async function writeSharedProviderState(source, state) {
  state.updatedAt = nowMs();
  providerHealth.set(source.name, state);
  await caches.default.put(
    providerCacheRequest(source.name),
    new Response(JSON.stringify(state), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=21600"
      }
    })
  );
}

function secondsSince(timestamp, at = nowMs()) {
  return timestamp ? Math.max(0, Math.round((at - timestamp) / 1000)) : null;
}

function secondsUntil(timestamp, at = nowMs()) {
  return timestamp ? Math.max(0, Math.ceil((timestamp - at) / 1000)) : 0;
}

function normalizeDataTimestamp(value, fallback = nowMs()) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed > 100000000000 ? parsed : parsed * 1000;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableSnapshotRecords(records) {
  return records
    .map((record) => ({
      hex: record.hex,
      lat: record.lat,
      lon: record.lon,
      altitude: record.altitude,
      speed: record.speed,
      track: record.track,
      verticalRate: record.verticalRate,
      positionObservedAt: record.positionObservedAt
    }))
    .sort((left, right) => String(left.hex).localeCompare(String(right.hex)));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs()) : null;
}

function providerState(source) {
  if (!providerHealth.has(source.name)) {
    providerHealth.set(source.name, {
      name: source.name,
      lastAttemptAt: 0,
      lastSuccessAt: 0,
      lastFailureAt: 0,
      lastStatus: null,
      consecutiveFailures: 0,
      cooldownUntil: 0
    });
  }
  return providerHealth.get(source.name);
}

function providerNextEligibleAt(source, at = nowMs()) {
  const state = providerState(source);
  const cadenceGate = state.lastSuccessAt ? state.lastSuccessAt + source.minRefreshMs : 0;
  return Math.max(state.cooldownUntil || 0, cadenceGate, at);
}

async function eligibleProviders(at = nowMs()) {
  const candidates = [];
  for (const source of SOURCES) {
    const state = await hydrateProviderState(source);
    const nextEligibleAt = providerNextEligibleAt(source, at);
    if (nextEligibleAt <= at) candidates.push({ source, state, nextEligibleAt });
  }
  return candidates
    .sort((a, b) => {
      if (a.state.consecutiveFailures !== b.state.consecutiveFailures) {
        return a.state.consecutiveFailures - b.state.consecutiveFailures;
      }
      return (a.state.lastSuccessAt || 0) - (b.state.lastSuccessAt || 0);
    })
    .map((candidate) => candidate.source);
}

function nextProviderEligibleAt(at = nowMs()) {
  return Math.min(...SOURCES.map((source) => providerNextEligibleAt(source, at)));
}

async function recordProviderSuccess(source, status = 200, at = nowMs()) {
  const state = providerState(source);
  state.lastAttemptAt = at;
  state.lastSuccessAt = at;
  state.lastStatus = status;
  state.consecutiveFailures = Math.max(0, Math.floor(state.consecutiveFailures / 2));
  state.cooldownUntil = Math.max(state.cooldownUntil || 0, at + source.minRefreshMs);
  await writeSharedProviderState(source, state);
}

async function recordProviderFailure(source, result, at = nowMs()) {
  const state = providerState(source);
  const status = Number(result.status) || result.status || "error";
  const retryAfterMs = parseRetryAfter(result.retryAfter);
  state.lastAttemptAt = at;
  state.lastFailureAt = at;
  state.lastStatus = status;
  state.consecutiveFailures += 1;

  if (status === 403) {
    state.cooldownUntil = at + source.forbiddenCooldownMs;
    await writeSharedProviderState(source, state);
    return;
  }

  if (status === 429) {
    const exponential = Math.min(MAX_FAILURE_COOLDOWN_MS, 60000 * 2 ** Math.min(5, state.consecutiveFailures - 1));
    state.cooldownUntil = at + Math.max(retryAfterMs || 0, exponential);
    await writeSharedProviderState(source, state);
    return;
  }

  const transient = Math.min(MAX_FAILURE_COOLDOWN_MS, 15000 * 2 ** Math.min(5, state.consecutiveFailures - 1));
  state.cooldownUntil = at + Math.max(retryAfterMs || 0, transient);
  await writeSharedProviderState(source, state);
}

function aircraft(raw, { providerMessageTimestamp = null, workerRetrievedAt = nowMs() } = {}) {
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const seen = num(raw.seen);
  const seenPos = num(raw.seen_pos);
  const hasSeenPos = Number.isFinite(seenPos) && seenPos >= 0;
  const hasSeen = Number.isFinite(seen) && seen >= 0;
  const sourcePositionAgeSeconds = hasSeenPos ? seenPos : hasSeen ? seen : null;
  const timestampBase = Number.isFinite(providerMessageTimestamp) ? providerMessageTimestamp : workerRetrievedAt;
  const positionObservedAt = Number.isFinite(sourcePositionAgeSeconds)
    ? timestampBase - sourcePositionAgeSeconds * 1000
    : null;
  const positionTimestampTrusted = Number.isFinite(providerMessageTimestamp) && Number.isFinite(sourcePositionAgeSeconds);
  const positionTimestampSource = hasSeenPos
    ? Number.isFinite(providerMessageTimestamp)
      ? "provider-message-minus-seen-pos"
      : "worker-retrieval-minus-seen-pos"
    : hasSeen
      ? Number.isFinite(providerMessageTimestamp)
        ? "provider-message-minus-seen"
        : "worker-retrieval-minus-seen"
      : "unavailable";
  return {
    hex: raw.hex || raw.icao || "",
    nNumber: (raw.r || raw.reg || raw.registration || "").trim(),
    callsign: (raw.flight || raw.call || "").trim(),
    type: (raw.t || raw.type || "").trim(),
    lat,
    lon,
    altitude: raw.alt_baro ?? raw.alt_geom ?? raw.altitude ?? null,
    speed: raw.gs ?? raw.tas ?? raw.ias ?? null,
    track: raw.track ?? raw.true_heading ?? raw.nav_heading ?? null,
    verticalRate: raw.baro_rate ?? raw.geom_rate ?? null,
    seen: raw.seen ?? null,
    seenPos: raw.seen_pos ?? null,
    sourcePositionAgeSeconds,
    sourceMessageTimestamp: providerMessageTimestamp,
    workerRetrievedAt,
    positionObservedAt,
    positionTimestampTrusted,
    positionTimestampSource,
    emergency: raw.emergency || null,
    category: raw.category || null,
    updatedAt: positionObservedAt
  };
}

function aircraftEndpoint(source, lat, lon, radiusMiles) {
  const radiusNm = Math.max(1, Math.min(250, nm(radiusMiles))).toFixed(1);
  return source.path === "point"
    ? `${source.base}/point/${lat}/${lon}/${radiusMiles}`
    : `${source.base}/lat/${lat}/lon/${lon}/dist/${radiusNm}`;
}

async function fetchUpstream(source, lat, lon, radiusMiles, { debugHex = "" } = {}) {
  const endpoint = aircraftEndpoint(source, lat, lon, radiusMiles);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  const startedAt = nowMs();

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": "ADSB Radar Worker/3.0 (+https://captainseang.github.io/ADSB-Radar/)" },
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        detail: `${source.name}: HTTP ${response.status}`,
        durationMs: nowMs() - startedAt
      };
    }

    const rawBody = await response.text();
    const data = JSON.parse(rawBody);
    const workerRetrievedAt = nowMs();
    const providerMessageTimestamp = normalizeDataTimestamp(data.now, null);
    const dataTimestamp = providerMessageTimestamp || workerRetrievedAt;
    const upstreamRawSnapshotHash = await sha256Hex(rawBody);
    const list = (data.ac || [])
      .map((raw) => aircraft(raw, { providerMessageTimestamp, workerRetrievedAt }))
      .filter(Boolean)
      .filter((plane) => miles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);
    const upstreamSnapshotHash = await sha256Hex(JSON.stringify(stableSnapshotRecords(list)));
    const upstreamSnapshotId = upstreamSnapshotHash.slice(0, 16);
    const normalizedDebugHex = String(debugHex || "").trim().toLowerCase();
    const rawDebugTarget = normalizedDebugHex
      ? (data.ac || []).find((raw) => String(raw.hex || raw.icao || "").trim().toLowerCase() === normalizedDebugHex)
      : null;
    const debugTargetRaw = rawDebugTarget
      ? {
          provider: source.name,
          httpStatus: response.status,
          workerRequestTimestamp: startedAt,
          workerRetrievedAt,
          providerMessageTimestamp,
          hex: rawDebugTarget.hex || rawDebugTarget.icao || "",
          callsign: String(rawDebugTarget.flight || rawDebugTarget.call || "").trim(),
          lat: rawDebugTarget.lat ?? null,
          lon: rawDebugTarget.lon ?? null,
          altitude: rawDebugTarget.alt_baro ?? rawDebugTarget.alt_geom ?? rawDebugTarget.altitude ?? null,
          groundspeed: rawDebugTarget.gs ?? rawDebugTarget.tas ?? rawDebugTarget.ias ?? null,
          track: rawDebugTarget.track ?? rawDebugTarget.true_heading ?? rawDebugTarget.nav_heading ?? null,
          seen: rawDebugTarget.seen ?? null,
          seenPos: rawDebugTarget.seen_pos ?? null,
          rawRecordHash: await sha256Hex(JSON.stringify(rawDebugTarget))
        }
      : null;

    return {
      ok: true,
      status: response.status,
      durationMs: nowMs() - startedAt,
      payload: {
        source: source.name,
        provider: source.name,
        now: data.now || Date.now() / 1000,
        dataTimestamp,
        providerMessageTimestamp,
        upstreamFetchedAt: workerRetrievedAt,
        upstreamRawSnapshotHash,
        upstreamSnapshotHash,
        upstreamSnapshotId,
        debugTargetRaw,
        aircraft: list,
        total: list.length
      }
    };
  } catch (error) {
    const detail = error?.name === "AbortError" ? `${source.name}: timeout` : `${source.name}: ${error?.message || error}`;
    return { ok: false, status: "timeout", detail, durationMs: nowMs() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

function providerHealthSummary(at = nowMs()) {
  return SOURCES.map((source) => {
    const state = providerState(source);
    return {
      name: source.name,
      lastStatus: state.lastStatus,
      consecutiveFailures: state.consecutiveFailures,
      lastSuccessAgeSeconds: secondsSince(state.lastSuccessAt, at),
      lastFailureAgeSeconds: secondsSince(state.lastFailureAt, at),
      cooldownRemainingSeconds: secondsUntil(state.cooldownUntil, at),
      nextEligibleInSeconds: secondsUntil(providerNextEligibleAt(source, at), at)
    };
  });
}

function aircraftWithinRadius(payload, lat, lon, radiusMiles) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusMiles)) {
    return Array.isArray(payload?.aircraft) ? payload.aircraft : [];
  }
  return (payload?.aircraft || []).filter((plane) => miles(lat, lon, plane.lat, plane.lon) <= radiusMiles + 1);
}

function payloadForRequest(entry, options = {}) {
  const payload = entry?.payload || {};
  const requestedRadiusMiles = Number(options.requestedRadiusMiles);
  if (!Number.isFinite(requestedRadiusMiles)) return payload;
  const aircraft = aircraftWithinRadius(payload, Number(options.lat), Number(options.lon), requestedRadiusMiles);
  return {
    ...payload,
    aircraft,
    total: aircraft.length
  };
}

function cacheMetadata(entry, options = {}) {
  const at = nowMs();
  const dataTimestamp = entry?.payload?.dataTimestamp || normalizeDataTimestamp(entry?.payload?.now, entry?.cachedAt || at);
  const nextEligibleAt = Math.max(entry?.nextRefreshEligibleAt || 0, nextProviderEligibleAt(at));
  const requestedRadiusMiles = Number(options.requestedRadiusMiles);
  const upstreamSnapshotId = entry?.payload?.upstreamSnapshotId || null;
  const debugHex = String(options.debugHex || "").trim().toLowerCase();
  const debugTarget = debugHex
    ? (entry?.payload?.aircraft || []).find((plane) => String(plane.hex || "").trim().toLowerCase() === debugHex) || null
    : null;
  return {
    provider: entry?.payload?.provider || entry?.payload?.source || null,
    dataTimestamp: dataTimestamp ? new Date(dataTimestamp).toISOString() : null,
    dataAgeSeconds: secondsSince(dataTimestamp, at),
    cacheAgeSeconds: secondsSince(entry?.cachedAt, at),
    ageSeconds: secondsSince(entry?.cachedAt, at),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    stale: Boolean(options.stale),
    upstreamRefreshAttempted: Boolean(options.upstreamRefreshAttempted),
    upstreamRefreshSucceeded: Boolean(options.upstreamRefreshSucceeded),
    upstreamRefreshInFlight: Boolean(options.upstreamRefreshInFlight),
    durableFallback: Boolean(options.durableFallback || entry?.durableSnapshot),
    cacheSource: options.cacheSource || (entry?.durableSnapshot ? "KV-durable" : "fast-cache-stale"),
    upstreamSnapshotId,
    upstreamSnapshotHash: entry?.payload?.upstreamSnapshotHash || null,
    upstreamRawSnapshotHash: entry?.payload?.upstreamRawSnapshotHash || null,
    responseSnapshotId: upstreamSnapshotId
      ? `${upstreamSnapshotId}:r${Number.isFinite(requestedRadiusMiles) ? requestedRadiusMiles : "all"}`
      : null,
    responseSnapshotHash: entry?.payload?.upstreamSnapshotHash || null,
    snapshotCreatedAt: dataTimestamp ? new Date(dataTimestamp).toISOString() : null,
    upstreamFetchedAt: entry?.payload?.upstreamFetchedAt
      ? new Date(entry.payload.upstreamFetchedAt).toISOString()
      : null,
    workerResponseTimestamp: new Date(at).toISOString(),
    geographicCell: entry?.key || null,
    nextRefreshEligibleInSeconds: secondsUntil(nextEligibleAt, at),
    requestedRadiusMiles: Number.isFinite(Number(options.requestedRadiusMiles)) ? Number(options.requestedRadiusMiles) : null,
    cacheRadiusMiles: Number.isFinite(Number(entry?.cacheRadiusMiles)) ? Number(entry.cacheRadiusMiles) : null,
    lastSuccessfulUpstreamFetch: entry?.lastRefreshSuccessAt ? new Date(entry.lastRefreshSuccessAt).toISOString() : null,
    workerVersion: VERSION,
    providerHealth: providerHealthSummary(at),
    debugTarget: debugTarget
      ? {
          ...debugTarget,
          snapshotId: upstreamSnapshotId,
          raw: entry?.payload?.debugTargetRaw || null
        }
      : null
  };
}

function responseFromCache(entry, options = {}) {
  return {
    ...payloadForRequest(entry, options),
    ...cacheMetadata(entry, options),
    upstreamFailures: entry.upstreamFailures || [],
    warning: options.warning || entry.warning || ""
  };
}

function emptyUnavailableResponse(message, options = {}) {
  const at = nowMs();
  return {
    error: message,
    source: "unavailable",
    provider: null,
    aircraft: [],
    total: 0,
    dataTimestamp: null,
    dataAgeSeconds: null,
    cacheAgeSeconds: null,
    ageSeconds: null,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    stale: false,
    durableFallback: false,
    upstreamRefreshAttempted: Boolean(options.upstreamRefreshAttempted),
    upstreamRefreshSucceeded: false,
    upstreamRefreshInFlight: false,
    nextRefreshEligibleInSeconds: secondsUntil(nextProviderEligibleAt(at), at),
    requestedRadiusMiles: Number.isFinite(Number(options.requestedRadiusMiles)) ? Number(options.requestedRadiusMiles) : null,
    cacheRadiusMiles: Number.isFinite(Number(options.cacheRadiusMiles)) ? Number(options.cacheRadiusMiles) : null,
    workerVersion: VERSION,
    providerHealth: providerHealthSummary(at),
    upstreamFailures: options.upstreamFailures || []
  };
}

async function storeFreshResult(key, result, at = nowMs(), failures = [], cacheRadiusMiles = null, env = null) {
  const entry = {
    payload: result.payload,
    cacheRadiusMiles,
    cachedAt: at,
    upstreamFailures: failures,
    warning: "",
    lastRefreshAttemptAt: at,
    lastRefreshSuccessAt: at,
    nextRefreshEligibleAt: at + TARGET_UPSTREAM_REFRESH_MS
  };
  await writeSharedCache(key, entry);
  await writeDurableSnapshot(env, key, entry);
  return entry;
}

async function refreshCache(
  key,
  lat,
  lon,
  radiusMiles,
  env,
  { allowProviderFallback = false, cacheRadiusMiles = radiusMiles, debugHex = "" } = {}
) {
  if (refreshFlights.has(key)) return refreshFlights.get(key);

  const flight = (async () => {
    const at = nowMs();
    const providers = await eligibleProviders(at);
    const failures = [];
    const attempts = allowProviderFallback ? providers.slice(0, 2) : providers.slice(0, 1);
    const existing = await readSharedCache(key);

    if (!attempts.length) {
      if (existing) {
        existing.lastRefreshAttemptAt = at;
        existing.nextRefreshEligibleAt = nextProviderEligibleAt(at);
        existing.upstreamFailures = ["No ADS-B provider currently eligible; serving cached traffic."];
        await writeSharedCache(key, existing);
      }
      return { attempted: false, succeeded: false, entry: existing || null, failures };
    }

    for (const source of attempts) {
      const result = await fetchUpstream(source, lat, lon, radiusMiles, { debugHex });
      if (!result.ok) {
        await recordProviderFailure(source, result, nowMs());
        failures.push(result.detail);
        continue;
      }

      if (!result.payload.aircraft.length) {
        await recordProviderSuccess(source, result.status, nowMs());
        const entry = await storeFreshResult(key, { ...result, payload: { ...result.payload, upstreamFailures: failures } }, nowMs(), failures, cacheRadiusMiles, env);
        return { attempted: true, succeeded: true, entry, provider: source.name, failures };
      }

      await recordProviderSuccess(source, result.status, nowMs());
      const entry = await storeFreshResult(key, result, nowMs(), failures, cacheRadiusMiles, env);
      return { attempted: true, succeeded: true, entry, provider: source.name, failures };
    }

    if (existing) {
      existing.lastRefreshAttemptAt = at;
      existing.nextRefreshEligibleAt = Math.max(at + TARGET_UPSTREAM_REFRESH_MS, nextProviderEligibleAt(at));
      existing.upstreamFailures = failures;
      existing.warning = "ADS-B upstream unavailable; serving stale cached aircraft data.";
      await writeSharedCache(key, existing);
    }
    return { attempted: true, succeeded: false, entry: existing || null, failures };
  })().finally(() => refreshFlights.delete(key));

  refreshFlights.set(key, flight);
  return flight;
}

function shouldRefresh(entry, at = nowMs()) {
  if (!entry) return true;
  if (refreshFlights.has(entry.key)) return false;
  return at >= Math.max(entry.nextRefreshEligibleAt || 0, nextProviderEligibleAt(at));
}

function revalidateInBackground(context, key, lat, lon, radiusMiles, env, cacheRadiusMiles, debugHex = "") {
  const promise = refreshCache(key, lat, lon, radiusMiles, env, { cacheRadiusMiles, debugHex }).catch((error) => {
    console.log(`ADS-B background refresh failed for ${key}: ${error?.message || error}`);
  });
  if (context?.waitUntil) context.waitUntil(promise);
}

async function handleAircraft(url, context, env) {
  const lat = num(url.searchParams.get("lat"));
  const lon = num(url.searchParams.get("lon"));
  const requestedRadiusMiles = Math.max(1, Math.min(250, num(url.searchParams.get("radiusMiles"), 15)));
  const debugHex = String(url.searchParams.get("debugHex") || "").trim().toLowerCase();
  const cacheRadiusMiles = cacheRadiusMilesFor(requestedRadiusMiles);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "lat and lon are required" }, 400);

  const taisAttempt = await fetchTaisGateway(env, lat, lon, requestedRadiusMiles);
  if (taisAttempt.ok) return json(taisAttempt.payload);

  const cell = trafficCellFor(lat, lon);
  const key = cacheKey(cell, cacheRadiusMiles);
  const upstreamRadiusMiles = upstreamRadiusMilesFor(cacheRadiusMiles);
  const at = nowMs();
  const cached = await readSharedCache(key);
  const cacheIsFresh = cached && secondsSince(cached.cachedAt, at) <= CACHE_TTL_SECONDS;
  const dataAge = cached ? secondsSince(cached.payload?.dataTimestamp || cached.cachedAt, at) : null;
  const dataStale = Number.isFinite(dataAge) && dataAge > STALE_AFTER_SECONDS;
  const dataTooOld = Number.isFinite(dataAge) && dataAge > MAX_STALE_SECONDS;

  if (cached && (cacheIsFresh || !shouldRefresh(cached, at))) {
    return json(
      withTaisFallback(responseFromCache(cached, {
        stale: dataStale || dataTooOld,
        upstreamRefreshInFlight: refreshFlights.has(key),
        cacheSource: cacheIsFresh ? "fast-cache-fresh" : "fast-cache-stale",
        debugHex,
        lat,
        lon,
        requestedRadiusMiles
      }), taisAttempt)
    );
  }

  if (cached) {
    revalidateInBackground(context, key, cell.lat, cell.lon, upstreamRadiusMiles, env, cacheRadiusMiles, debugHex);
    return json(
      withTaisFallback(responseFromCache(cached, {
        stale: dataStale || dataTooOld,
        upstreamRefreshInFlight: refreshFlights.has(key),
        lat,
        lon,
        requestedRadiusMiles,
        cacheSource: "fast-cache-stale",
        debugHex,
        warning: "Serving cached ADS-B traffic while refreshing upstream in the background."
      }), taisAttempt)
    );
  }

  const initial = await refreshCache(key, cell.lat, cell.lon, upstreamRadiusMiles, env, {
    allowProviderFallback: true,
    cacheRadiusMiles,
    debugHex
  });
  if (initial.entry) {
    return json(
      withTaisFallback(responseFromCache(initial.entry, {
        stale: !initial.succeeded,
        upstreamRefreshAttempted: initial.attempted,
        upstreamRefreshSucceeded: initial.succeeded,
        upstreamRefreshInFlight: false,
        lat,
        lon,
        requestedRadiusMiles,
        cacheSource: initial.succeeded ? "upstream-fresh" : "fast-cache-stale",
        debugHex,
        warning: initial.succeeded ? "" : "ADS-B upstream unavailable; serving cached aircraft data."
      }), taisAttempt),
      initial.succeeded ? 200 : 200
    );
  }

  const durable = await readDurableSnapshot(env, key, at);
  if (durable) {
    return json(
      withTaisFallback(responseFromCache(durable, {
        stale: true,
        durableFallback: true,
        upstreamRefreshAttempted: initial.attempted,
        upstreamRefreshSucceeded: false,
        upstreamRefreshInFlight: false,
        lat,
        lon,
        requestedRadiusMiles,
        cacheSource: "KV-durable",
        debugHex,
        warning: "ADS-B upstream unavailable; serving durable last-known-good traffic snapshot."
      }), taisAttempt)
    );
  }

  return json(
    withTaisFallback(emptyUnavailableResponse("All ADS-B upstreams failed", {
      upstreamRefreshAttempted: initial.attempted,
      upstreamFailures: initial.failures,
      requestedRadiusMiles,
      cacheRadiusMiles
    }), taisAttempt),
    502
  );
}

export default {
  async fetch(request, env, context) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/admin/metrics") return adminMetrics(request, env);
    if (url.pathname === "/api/metar") return handleMetar(url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        workerVersion: VERSION,
        cacheTtlSeconds: CACHE_TTL_SECONDS,
        targetUpstreamRefreshSeconds: TARGET_UPSTREAM_REFRESH_MS / 1000,
        trafficRadiusBucketsMiles: TRAFFIC_RADIUS_BUCKETS_MILES,
        trafficCacheCellDegrees: TRAFFIC_CACHE_CELL_DEGREES,
        durableSnapshotTtlSeconds: DURABLE_SNAPSHOT_TTL_SECONDS,
        durableSnapshotBindingConfigured: Boolean(env?.ADSB_LKG_KV),
        activeClientTelemetryConfigured: Boolean(activeClientStub(env)),
        taisGatewayConfigured: taisConfiguration(env).configured,
        taisCoverage: {
          sourceFacility: "P50",
          centerLat: TAIS_COVERAGE_CENTER.lat,
          centerLon: TAIS_COVERAGE_CENTER.lon,
          radiusMiles: TAIS_COVERAGE_RADIUS_MILES
        },
        taisState: taisLastResult
          ? {
              selected: Boolean(taisLastResult.ok),
              state: taisLastResult.state || "unavailable",
              lastAttemptAgeSeconds: secondsSince(taisLastAttemptAt),
              reason: taisLastResult.ok ? "live" : taisLastResult.reason
            }
          : null,
        providerHealth: providerHealthSummary()
      });
    }
    if (url.pathname === "/api/aircraft") {
      const observation = recordActiveClient(request, env).catch((error) => {
        console.log(`Active-client telemetry failed: ${error?.message || error}`);
      });
      if (context?.waitUntil) context.waitUntil(observation);
      else await observation;
      return handleAircraft(url, context, env);
    }
    return json({ error: "Not found", workerVersion: VERSION }, 404);
  }
};

export const __test = {
  fetchTaisGateway,
  taisCoverageEligible,
  taisFallbackMetadata,
  normalizeAnonymousClientId,
  normalizeClientSource,
  activeClientMetrics,
  tokenMatches,
  handleMetar
};
