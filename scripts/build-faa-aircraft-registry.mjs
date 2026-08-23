import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SOURCE_URL = "https://registry.faa.gov/database/ReleasableAircraft.zip";
const SOURCE_PAGE =
  "https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download";
const OUTPUT_DIR = resolve("public/data/faa-aircraft");
const SCHEMA_VERSION = 1;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function cleanHeader(value) {
  return String(value).replace(/^\uFEFF/, "").trim();
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
}

async function forEachCsvRow(path, callback) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers = null;
  for await (const line of lines) {
    if (!headers) {
      headers = parseCsvLine(line).map(cleanHeader);
      continue;
    }
    if (!line.trim()) continue;
    await callback(rowObject(headers, parseCsvLine(line)));
  }
}

function normalizeHex(value) {
  const hex = String(value || "").trim().toUpperCase().replace(/^0X/, "");
  return /^[0-9A-F]{6}$/.test(hex) ? hex : "";
}

function normalizeNNumber(value) {
  const suffix = String(value || "").trim().toUpperCase().replace(/^N/, "").replace(/[^0-9A-Z]/g, "");
  return suffix ? `N${suffix}` : "";
}

const aircraftCategories = new Map([
  ["1", "Glider"],
  ["2", "Balloon"],
  ["3", "Blimp/Dirigible"],
  ["4", "Fixed wing single engine"],
  ["5", "Fixed wing multi engine"],
  ["6", "Rotorcraft"],
  ["7", "Weight-shift-control"],
  ["8", "Powered parachute"],
  ["9", "Gyroplane"],
  ["H", "Hybrid lift"],
  ["O", "Other"]
]);

const statusPriority = new Map([
  ["V", 100],
  ["T", 95],
  ["M", 90],
  ["R", 85],
  ["N", 80],
  ["S", 70],
  ["A", 65]
]);

async function downloadArchive(path) {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 ADSB-Radar-Offline-Data-Builder/1.1",
      referer: SOURCE_PAGE
    }
  });
  if (!response.ok || !response.body) throw new Error(`FAA download failed: HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(path));
}

async function sourceDirectory() {
  const suppliedInput = argument("--input");
  const work = await mkdtemp(join(tmpdir(), "adsb-faa-registry-"));
  const input = suppliedInput ? resolve(suppliedInput) : join(work, "ReleasableAircraft.zip");
  if (!suppliedInput) await downloadArchive(input);

  const inputStats = await stat(input);
  if (inputStats.isDirectory()) return { directory: input, work, archive: null };
  await execFileAsync("unzip", ["-o", input, "MASTER.txt", "ACFTREF.txt", "-d", work]);
  return { directory: work, work, archive: input };
}

async function main() {
  const { directory, work, archive } = await sourceDirectory();
  try {
    const masterPath = join(directory, "MASTER.txt");
    const referencePath = join(directory, "ACFTREF.txt");
    const references = new Map();
    await forEachCsvRow(referencePath, (row) => {
      const code = row.CODE.trim();
      if (!code) return;
      references.set(code, {
        // Amateur-built manufacturer fields may contain an individual builder's name.
        manufacturer: row["BUILD-CERT-IND"].trim() === "1" ? "" : row.MFR.trim(),
        model: row.MODEL.trim(),
        category: aircraftCategories.get(row["TYPE-ACFT"].trim()) || ""
      });
    });

    const records = new Map();
    let sourceRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;
    let matchedMakeModelCount = 0;
    let unmatchedMakeModelCount = 0;

    await forEachCsvRow(masterPath, (row) => {
      sourceRows += 1;
      const hex = normalizeHex(row["MODE S CODE HEX"]);
      const registration = normalizeNNumber(row["N-NUMBER"]);
      if (!hex || !registration) {
        invalidRows += 1;
        return;
      }

      const reference = references.get(row["MFR MDL CODE"].trim());
      const category = reference?.category || aircraftCategories.get(row["TYPE AIRCRAFT"].trim()) || "";
      const year = /^\d{4}$/.test(row["YEAR MFR"].trim()) ? Number(row["YEAR MFR"].trim()) : 0;
      const compact = [
        registration,
        reference?.manufacturer || "",
        reference?.model || "",
        category,
        year
      ];
      const priority = statusPriority.get(row["STATUS CODE"].trim()) || 0;
      const existing = records.get(hex);
      if (existing) {
        duplicateRows += 1;
        if (existing.priority > priority) return;
      }
      records.set(hex, { compact, priority, matched: Boolean(reference) });
    });

    const shards = new Map();
    for (const [hex, record] of records) {
      const prefix = hex.slice(0, 2).toLowerCase();
      if (!shards.has(prefix)) shards.set(prefix, {});
      shards.get(prefix)[hex] = record.compact;
      if (record.matched) matchedMakeModelCount += 1;
      else unmatchedMakeModelCount += 1;
    }

    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
    const sourceStats = await stat(masterPath);
    const generatedAt = new Date().toISOString();
    const sourceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(sourceStats.mtime);
    const shardMetadata = [];
    let totalBytes = 0;
    for (const [prefix, shardRecords] of [...shards.entries()].sort()) {
      const filename = `${prefix}.json`;
      const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: shardRecords });
      await writeFile(join(OUTPUT_DIR, filename), content);
      totalBytes += Buffer.byteLength(content);
      shardMetadata.push({ prefix, file: filename, recordCount: Object.keys(shardRecords).length });
    }

    const index = {
      metadata: {
        dataset: "FAA aircraft identity lookup",
        schemaVersion: SCHEMA_VERSION,
        source: "FAA Releasable Aircraft Registration Database",
        sourceUrl: SOURCE_PAGE,
        sourceDownloadUrl: SOURCE_URL,
        sourceDate,
        generatedAt,
        sourceRecordCount: sourceRows,
        recordCount: records.size,
        matchedMakeModelCount,
        unmatchedMakeModelCount,
        invalidRecordCount: invalidRows,
        duplicateModeSCount: duplicateRows,
        piiIncluded: false,
        fields: ["registration", "manufacturer", "model", "category", "year"]
      },
      shards: shardMetadata
    };
    const indexContent = JSON.stringify(index);
    await writeFile(join(OUTPUT_DIR, "index.json"), indexContent);
    totalBytes += Buffer.byteLength(indexContent);

    console.log(
      JSON.stringify(
        {
          ...index.metadata,
          shardCount: shardMetadata.length,
          outputBytes: totalBytes,
          outputMiB: Number((totalBytes / 1024 / 1024).toFixed(2)),
          outputDirectory: OUTPUT_DIR
        },
        null,
        2
      )
    );
  } finally {
    if (work !== directory || archive) await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
