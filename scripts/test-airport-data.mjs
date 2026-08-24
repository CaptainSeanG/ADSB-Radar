import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const file = new URL("../public/data/offline-airports.json", import.meta.url);
const payload = JSON.parse(await readFile(file, "utf8"));
const airports = payload.airports || [];
const byIdent = new Map(airports.map((airport) => [airport.ident, airport]));

assert.ok(airports.length >= 10000, `expected nationwide airport coverage, got ${airports.length}`);
for (const ident of ["KPHX", "KLAX", "KJFK", "KORD", "KATL", "KSEA", "PANC", "PHNL", "TJSJ"]) {
  assert.ok(byIdent.has(ident), `missing required airport ${ident}`);
}

let runwayCount = 0;
let frequencyCount = 0;
for (const airport of airports) {
  assert.ok(Number.isFinite(airport.lat) && airport.lat >= -90 && airport.lat <= 90, `invalid latitude for ${airport.ident}`);
  assert.ok(Number.isFinite(airport.lon) && airport.lon >= -180 && airport.lon <= 180, `invalid longitude for ${airport.ident}`);
  runwayCount += airport.runways?.length || 0;
  frequencyCount += airport.frequencies?.length || 0;
}

assert.ok(runwayCount > 9000, `expected bundled runways, got ${runwayCount}`);
assert.ok(frequencyCount > 5000, `expected bundled frequencies, got ${frequencyCount}`);
assert.ok(byIdent.get("KDVT")?.runways?.length, "KDVT should retain runway data");
assert.ok(byIdent.get("KDVT")?.frequencies?.length, "KDVT should retain frequency data");
assert.equal(payload.metadata?.schemaVersion, 3, "airport schema version should be documented");
assert.equal(payload.metadata?.faaNasrCycle, "2026-08-06", "FAA NASR source cycle should be documented");

for (const ident of ["KGYR", "KDVT", "KSDL", "KPHX"]) {
  const airport = byIdent.get(ident);
  assert.ok(airport, `missing airport-card test airport ${ident}`);
  assert.equal(airport.towered, true, `${ident} should be towered from FAA ATC data`);
  assert.ok(airport.towerHours, `${ident} should retain FAA tower hours`);
  assert.ok(airport.tpa, `${ident} should retain FAA TPA data`);
}

const goodyear = byIdent.get("KGYR");
assert.equal(goodyear.towerHours, "0600-2100");
assert.equal(goodyear.tpa.kind, "remarks");
assert.ok(goodyear.frequencies.some((frequency) => frequency.frequencyMHz === 120.1 && frequency.roles?.includes("Tower") && frequency.roles?.includes("CTAF")));
assert.ok(goodyear.frequencies.some((frequency) => frequency.frequencyMHz === 122.95 && frequency.roles?.includes("UNICOM")));

assert.equal(byIdent.get("0J0")?.towered, false, "0J0 should remain non-towered");
assert.equal(byIdent.get("0J0")?.tpa?.kind, "standard", "airport without published TPA should use the labeled standard fallback");
assert.equal(byIdent.get("KAEX")?.tpa?.aglFt, 1200, "non-standard FAA-published TPA should be preserved");
assert.ok(byIdent.get("KAEX")?.tpa?.mslFt, "published TPA should include derived MSL using FAA elevation");

const bytes = (await stat(file)).size;
console.log(`Airport data tests passed: ${airports.length} airports, ${runwayCount} runways, ${frequencyCount} frequencies, ${bytes.toLocaleString()} bytes.`);
