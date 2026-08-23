import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("public/data/faa-aircraft");
const index = JSON.parse(await readFile(resolve(directory, "index.json"), "utf8"));
assert.equal(index.metadata.schemaVersion, 1);
assert.equal(index.metadata.piiIncluded, false);
assert.deepEqual(index.metadata.fields, ["registration", "manufacturer", "model", "category", "year"]);

let count = 0;
let bytes = (await stat(resolve(directory, "index.json"))).size;
const seen = new Set();
let knownRecord = null;
for (const shard of index.shards) {
  const path = resolve(directory, shard.file);
  const payload = JSON.parse(await readFile(path, "utf8"));
  bytes += (await stat(path)).size;
  assert.equal(payload.schemaVersion, 1);
  const entries = Object.entries(payload.records || {});
  assert.equal(entries.length, shard.recordCount);
  for (const [hex, compact] of entries) {
    assert.match(hex, /^[0-9A-F]{6}$/);
    assert.equal(seen.has(hex), false, `duplicate Mode S key ${hex}`);
    seen.add(hex);
    assert.equal(Array.isArray(compact), true);
    assert.equal(compact.length, 5);
    assert.match(compact[0], /^N[0-9A-Z]+$/);
    if (hex === "A62676") knownRecord = compact;
  }
  count += entries.length;
}

assert.equal(count, index.metadata.recordCount);
assert.deepEqual(knownRecord, ["N496AV", "CIRRUS DESIGN CORP", "SR20", "Fixed wing single engine", 2023]);

console.log(
  JSON.stringify(
    {
      sourceDate: index.metadata.sourceDate,
      recordCount: count,
      matchedMakeModelCount: index.metadata.matchedMakeModelCount,
      shardCount: index.shards.length,
      bytes,
      mebibytes: Number((bytes / 1024 / 1024).toFixed(2)),
      knownRecord: { hex: "A62676", registration: knownRecord[0], model: knownRecord[2] },
      piiIncluded: index.metadata.piiIncluded
    },
    null,
    2
  )
);
