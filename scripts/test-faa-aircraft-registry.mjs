import assert from "node:assert/strict";
import { FaaAircraftRegistry, normalizeIcaoHex, registryRecordFromCompact } from "../public/aircraft-registry.js";

assert.equal(normalizeIcaoHex(" a62676 "), "A62676");
assert.equal(normalizeIcaoHex("0xa62676"), "A62676");
assert.equal(normalizeIcaoHex(""), "");
assert.equal(normalizeIcaoHex("zzzzzz"), "");

const fixture = { A62676: ["N4960X", "PIPER", "PA-28-181", "Fixed wing single engine", 1978] };
const registry = new FaaAircraftRegistry({
  fetchImpl: async (url) => ({ ok: url.endsWith("/a6.json"), json: async () => ({ records: fixture }) })
});
const record = await registry.resolve("a62676");
assert.deepEqual(record, {
  source: "FAA",
  icaoHex: "A62676",
  registration: "N4960X",
  manufacturer: "PIPER",
  model: "PA-28-181",
  category: "Fixed wing single engine",
  year: 1978,
  displayType: "PA-28-181"
});
assert.equal(await registry.resolve("C00001"), null, "foreign/no-match ICAO must gracefully miss");
assert.equal(await registry.resolve(""), null);
assert.equal(registryRecordFromCompact("A00001", null), null);

const serialized = JSON.stringify(fixture);
for (const piiField of ["NAME", "STREET", "CITY", "ZIP CODE", "owner", "address"]) {
  assert.equal(serialized.includes(piiField), false, `fixture must not expose ${piiField}`);
}

console.log("FAA aircraft registry lookup tests passed");
