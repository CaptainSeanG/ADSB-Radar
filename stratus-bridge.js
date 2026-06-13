import dgram from "node:dgram";
import { createServer } from "node:http";
import os from "node:os";

const httpPort = Number(process.env.STRATUS_BRIDGE_HTTP_PORT || 8787);
const udpPorts = String(process.env.STRATUS_GDL90_PORTS || process.env.STRATUS_GDL90_PORT || "4000,4001,43211")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value, index, values) => Number.isInteger(value) && value > 0 && value < 65536 && values.indexOf(value) === index);
const staleAfterMs = Number(process.env.STRATUS_STALE_MS || 30000);
const maxTrafficAgeMs = Number(process.env.STRATUS_MAX_TRAFFIC_AGE_MS || 90000);

const traffic = new Map();
const portStats = new Map(udpPorts.map((port) => [port, { packetCount: 0, byteCount: 0, lastPacketAt: 0 }]));
let packetCount = 0;
let frameCount = 0;
let trafficFrameCount = 0;
let ownshipFrameCount = 0;
let ownshipGeoAltitudeFrameCount = 0;
let fisbFrameCount = 0;
let ahrsFrameCount = 0;
let heartbeatFrameCount = 0;
let decodeErrors = 0;
let lastPacketAt = 0;
let lastFrameAt = 0;
let lastWeatherFrameAt = 0;
let lastAhrsFrameAt = 0;
let ownship = null;
let ownshipGeoAltitude = null;
let heartbeat = null;
let lastFisbSummary = null;
const messageCounts = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

function signed24(buffer, offset) {
  let value = (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
  if (value & 0x800000) value -= 0x1000000;
  return value;
}

function decodeCoordinate(buffer, offset) {
  return (signed24(buffer, offset) * 180) / 0x800000;
}

function signed12(value) {
  return value & 0x800 ? value - 0x1000 : value;
}

function decodeCallsign(buffer, offset = 19, length = 8) {
  return buffer
    .subarray(offset, offset + length)
    .toString("ascii")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

function incrementMessageCount(messageId) {
  messageCounts.set(messageId, (messageCounts.get(messageId) || 0) + 1);
}

function decodeHeartbeat(frame) {
  if (frame.length < 7) return null;
  return {
    status1: frame[1],
    status2: frame[2],
    timestamp: frame[3] | (frame[4] << 8),
    messageCounts: frame[5] | (frame[6] << 8),
    updatedAt: Date.now()
  };
}

function decodeOwnshipGeoAltitude(frame) {
  if (frame.length < 4) return null;
  const rawAltitude = (frame[1] << 8) | frame[2];
  const altitude = rawAltitude === 0xffff ? null : rawAltitude * 5 - 1000;
  return {
    altitude,
    verticalWarning: Boolean(frame[3] & 0x80),
    metrics: Boolean(frame[3] & 0x01),
    updatedAt: Date.now()
  };
}

function summarizeFisb(frame) {
  const payload = frame.subarray(1);
  return {
    byteLength: payload.length,
    firstBytes: payload.subarray(0, 24).toString("hex").toUpperCase(),
    updatedAt: Date.now()
  };
}

function decodeTrafficReport(frame) {
  if (frame.length < 27) return null;

  const hex = frame.subarray(2, 5).toString("hex").toUpperCase();
  const lat = decodeCoordinate(frame, 5);
  const lon = decodeCoordinate(frame, 8);
  const rawAltitude = ((frame[11] << 4) | (frame[12] >> 4)) & 0xfff;
  const altitude = rawAltitude === 0xfff ? null : rawAltitude * 25 - 1000;
  // Byte 13 contains NIC/NACp metadata; velocity starts at byte 14 in GDL90 traffic reports.
  const speed = ((frame[14] << 4) | (frame[15] >> 4)) & 0xfff;
  const track = Math.round((frame[17] * 360) / 256);
  const verticalRateRaw = ((frame[15] & 0x0f) << 8) | frame[16];
  const verticalRate = verticalRateRaw === 0x800 ? null : signed12(verticalRateRaw) * 64;
  const callsign = decodeCallsign(frame);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  return {
    hex,
    nNumber: "",
    callsign,
    type: "",
    lat,
    lon,
    altitude,
    speed: speed === 0xfff ? null : speed,
    track,
    verticalRate,
    seen: 0,
    emergency: null,
    category: null,
    updatedAt: Date.now()
  };
}

function decodeGdl90Frame(frame) {
  if (!frame.length) return;
  const messageId = frame[0];
  incrementMessageCount(messageId);

  if (messageId === 0) {
    const report = decodeHeartbeat(frame);
    if (report) {
      heartbeat = report;
      heartbeatFrameCount += 1;
    }
    return;
  }

  if (messageId === 7) {
    lastFisbSummary = summarizeFisb(frame);
    fisbFrameCount += 1;
    lastWeatherFrameAt = Date.now();
    return;
  }

  if (messageId === 10) {
    const report = decodeTrafficReport(frame);
    if (report) {
      ownship = report;
      ownshipFrameCount += 1;
    }
    return;
  }

  if (messageId === 11) {
    ownshipGeoAltitude = decodeOwnshipGeoAltitude(frame);
    if (ownshipGeoAltitude) {
      ownshipFrameCount += 1;
      ownshipGeoAltitudeFrameCount += 1;
      if (ownship) {
        ownship.geoAltitude = ownshipGeoAltitude.altitude;
        ownship.updatedAt = Date.now();
      }
    }
    return;
  }

  if (messageId === 20) {
    const report = decodeTrafficReport(frame);
    if (report) {
      traffic.set(report.hex || `${report.lat},${report.lon}`, report);
      trafficFrameCount += 1;
    }
    return;
  }

  // Stratus AHRS appears to use vendor-specific frames. Keep counters and last-seen
  // metadata here so packet captures immediately show us which message IDs to decode.
  if (messageId >= 0x65) {
    ahrsFrameCount += 1;
    lastAhrsFrameAt = Date.now();
  }
}

function unescapeFrame(frame) {
  const bytes = [];
  for (let index = 0; index < frame.length; index += 1) {
    const byte = frame[index];
    if (byte === 0x7d && index + 1 < frame.length) {
      bytes.push(frame[index + 1] ^ 0x20);
      index += 1;
    } else {
      bytes.push(byte);
    }
  }

  return Buffer.from(bytes);
}

function parsePacket(packet) {
  let start = -1;
  for (let index = 0; index < packet.length; index += 1) {
    if (packet[index] !== 0x7e) continue;

    if (start >= 0 && index > start + 1) {
      const rawFrame = packet.subarray(start + 1, index);
      try {
        const frame = unescapeFrame(rawFrame);
        const payload = frame.length > 2 ? frame.subarray(0, -2) : frame;
        frameCount += 1;
        lastFrameAt = Date.now();
        decodeGdl90Frame(payload);
      } catch {
        decodeErrors += 1;
      }
    }

    start = index;
  }
}

function pruneTraffic() {
  const now = Date.now();
  for (const [key, plane] of traffic.entries()) {
    if (now - plane.updatedAt > maxTrafficAgeMs) traffic.delete(key);
  }
}

function aircraftPayload() {
  pruneTraffic();
  const now = Date.now();
  const aircraft = Array.from(traffic.values()).map((plane) => ({
    ...plane,
    seen: Math.max(0, (now - plane.updatedAt) / 1000)
  }));

  return {
    source: "Stratus",
    stale: lastPacketAt ? now - lastPacketAt > staleAfterMs : true,
    ageSeconds: lastPacketAt ? Math.round((now - lastPacketAt) / 1000) : null,
    aircraft,
    ac: aircraft,
    total: aircraft.length,
    ownship: ownshipPayload().ownship
  };
}

function ownshipPayload() {
  const now = Date.now();
  const ageSeconds = ownship?.updatedAt ? Math.round((now - ownship.updatedAt) / 1000) : null;
  return {
    source: "Stratus",
    supported: true,
    stale: ownship?.updatedAt ? now - ownship.updatedAt > staleAfterMs : true,
    ageSeconds,
    ownship: ownship
      ? {
          ...ownship,
          seen: Math.max(0, (now - ownship.updatedAt) / 1000),
          geoAltitude: ownshipGeoAltitude?.altitude ?? ownship.geoAltitude ?? null
        }
      : null,
    heartbeat,
    geoAltitude: ownshipGeoAltitude
  };
}

function weatherPayload() {
  return {
    source: "Stratus",
    supported: false,
    stale: lastWeatherFrameAt ? Date.now() - lastWeatherFrameAt > staleAfterMs : true,
    ageSeconds: lastWeatherFrameAt ? Math.round((Date.now() - lastWeatherFrameAt) / 1000) : null,
    fisbFrameCount,
    lastFisbSummary,
    products: [],
    message: "FIS-B frames are being counted, but weather product decoding is not implemented yet."
  };
}

function ahrsPayload() {
  return {
    source: "Stratus",
    supported: false,
    stale: lastAhrsFrameAt ? Date.now() - lastAhrsFrameAt > staleAfterMs : true,
    ageSeconds: lastAhrsFrameAt ? Math.round((Date.now() - lastAhrsFrameAt) / 1000) : null,
    ahrsFrameCount,
    attitude: null,
    message: "Vendor-specific Stratus AHRS frames need packet captures or documentation before decoding."
  };
}

function networkInterfaces() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) =>
      (addresses || [])
        .filter((address) => address.family === "IPv4" && !address.internal)
        .map((address) => ({
          name,
          address: address.address,
          netmask: address.netmask
        }))
    );
}

function handlePacket(packet, port) {
  packetCount += 1;
  lastPacketAt = Date.now();
  const stats = portStats.get(port);
  if (stats) {
    stats.packetCount += 1;
    stats.byteCount += packet.length;
    stats.lastPacketAt = lastPacketAt;
  }
  parsePacket(packet);
}

function bindUdpPort(port) {
  const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });

  udp.on("message", (packet) => {
    handlePacket(packet, port);
  });

  udp.on("error", (error) => {
    console.error(`Stratus UDP listener error on ${port}:`, error);
  });

  udp.bind(port, "0.0.0.0", () => {
    udp.setBroadcast(true);
    console.log(`Listening for Stratus/GDL90 UDP on 0.0.0.0:${port}`);
  });
}

udpPorts.forEach(bindUdpPort);

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/") {
    json(res, 200, {
      ok: true,
      source: "Stratus",
      udpPorts,
      httpPort,
      packetCount,
      frameCount,
      trafficFrameCount,
      ownshipFrameCount,
      ownshipGeoAltitudeFrameCount,
      fisbFrameCount,
      ahrsFrameCount,
      heartbeatFrameCount,
      decodeErrors,
      trafficCount: traffic.size,
      lastPacketAgeSeconds: lastPacketAt ? Math.round((Date.now() - lastPacketAt) / 1000) : null,
      lastFrameAgeSeconds: lastFrameAt ? Math.round((Date.now() - lastFrameAt) / 1000) : null,
      lastWeatherFrameAgeSeconds: lastWeatherFrameAt ? Math.round((Date.now() - lastWeatherFrameAt) / 1000) : null,
      lastAhrsFrameAgeSeconds: lastAhrsFrameAt ? Math.round((Date.now() - lastAhrsFrameAt) / 1000) : null,
      messageCounts: Object.fromEntries(
        Array.from(messageCounts.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([id, count]) => [String(id), count])
      ),
      portStats: Object.fromEntries(
        Array.from(portStats.entries()).map(([port, stats]) => [
          port,
          {
            ...stats,
            lastPacketAgeSeconds: stats.lastPacketAt ? Math.round((Date.now() - stats.lastPacketAt) / 1000) : null
          }
        ])
      ),
      networkInterfaces: networkInterfaces()
    });
    return;
  }

  if (url.pathname === "/api/aircraft") {
    json(res, 200, aircraftPayload());
    return;
  }

  if (url.pathname === "/api/ownship") {
    json(res, 200, ownshipPayload());
    return;
  }

  if (url.pathname === "/api/weather") {
    json(res, 200, weatherPayload());
    return;
  }

  if (url.pathname === "/api/ahrs") {
    json(res, 200, ahrsPayload());
    return;
  }

  json(res, 404, { error: "Not found" });
}).listen(httpPort, "0.0.0.0", () => {
  console.log(`Stratus bridge running at http://127.0.0.1:${httpPort}`);
});
