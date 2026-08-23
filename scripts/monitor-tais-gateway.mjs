const baseUrl = String(process.env.TAIS_MONITOR_URL || "").replace(/\/$/, "");
const token = String(process.env.TAIS_GATEWAY_TOKEN || "");
const durationSeconds = Math.max(30, Number(process.env.TAIS_MONITOR_SECONDS || 900));
const pollSeconds = Math.max(1, Number(process.env.TAIS_MONITOR_POLL_SECONDS || 3));

if (!baseUrl || !token) {
  throw new Error("TAIS_MONITOR_URL and TAIS_GATEWAY_TOKEN are required");
}

const endpoint = `${baseUrl}/api/aircraft?lat=33.45&lon=-112.07&radiusMiles=100`;
const startedAt = Date.now();
const samples = [];
const observationsByAircraft = new Map();
let advancedPositions = 0;
let repeatedObservations = 0;

while (Date.now() - startedAt < durationSeconds * 1000) {
  const response = await fetch(endpoint, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`TAIS monitor received HTTP ${response.status}: ${payload.error || "unknown error"}`);
  samples.push({
    at: new Date().toISOString(),
    total: payload.total,
    snapshotId: payload.upstreamSnapshotId,
    dataTimestamp: payload.dataTimestamp,
    dataAgeSeconds: payload.dataAgeSeconds,
    gateway: payload.gateway
  });

  for (const aircraft of payload.aircraft || []) {
    const key = String(aircraft.hex || "");
    const timestamp = Number(aircraft.positionObservedAt);
    if (!key || !Number.isFinite(timestamp)) continue;
    const previous = observationsByAircraft.get(key);
    if (previous && timestamp > previous.timestamp) {
      advancedPositions += 1;
    } else if (previous && timestamp === previous.timestamp) {
      repeatedObservations += 1;
    }
    observationsByAircraft.set(key, {
      timestamp,
      lat: aircraft.lat,
      lon: aircraft.lon
    });
  }
  await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
}

const latest = samples.at(-1) || {};
console.log(JSON.stringify({
  durationSeconds: Math.round((Date.now() - startedAt) / 1000),
  requests: samples.length,
  uniqueObservedTracks: observationsByAircraft.size,
  advancedPositions,
  repeatedObservations,
  firstSnapshot: samples[0]?.snapshotId || null,
  lastSnapshot: latest.snapshotId || null,
  lastDataTimestamp: latest.dataTimestamp || null,
  lastDataAgeSeconds: latest.dataAgeSeconds ?? null,
  gateway: latest.gateway || null
}, null, 2));
