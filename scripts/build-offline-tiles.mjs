#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url);
const dataDir = new URL("../public/data/", import.meta.url);
const airportInputUrl = new URL("../public/data/offline-airports.json", import.meta.url);
const airspaceInputUrl = new URL("../public/data/offline-airspace.json", import.meta.url);
const tileRootUrl = new URL("../public/data/tiles/", import.meta.url);
const airportTileDirUrl = new URL("../public/data/tiles/airports/", import.meta.url);
const airspaceTileDirUrl = new URL("../public/data/tiles/airspace/", import.meta.url);
const tileDegrees = 4;

function tileIdFor(lat, lon) {
  const latBase = Math.floor(Number(lat) / tileDegrees) * tileDegrees;
  const lonBase = Math.floor(Number(lon) / tileDegrees) * tileDegrees;
  const ns = latBase >= 0 ? "n" : "s";
  const ew = lonBase >= 0 ? "e" : "w";
  return `${ns}${String(Math.abs(latBase)).padStart(2, "0")}${ew}${String(Math.abs(lonBase)).padStart(3, "0")}`;
}

function tileIdsForBbox(bbox) {
  const [west, south, east, north] = bbox.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return [];
  const ids = [];
  const latStart = Math.floor(south / tileDegrees) * tileDegrees;
  const latEnd = Math.floor(north / tileDegrees) * tileDegrees;
  const lonStart = Math.floor(west / tileDegrees) * tileDegrees;
  const lonEnd = Math.floor(east / tileDegrees) * tileDegrees;
  for (let lat = latStart; lat <= latEnd; lat += tileDegrees) {
    for (let lon = lonStart; lon <= lonEnd; lon += tileDegrees) {
      ids.push(tileIdFor(lat, lon));
    }
  }
  return ids;
}

function bboxForRings(rings) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings || []) {
    for (const point of ring || []) {
      west = Math.min(west, Number(point.lon));
      south = Math.min(south, Number(point.lat));
      east = Math.max(east, Number(point.lon));
      north = Math.max(north, Number(point.lat));
    }
  }
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return [west, south, east, north].map((value) => Number(value.toFixed(5)));
}

function addToTile(map, id, row) {
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(row);
}

async function writeTileSet({ rowsByTile, directoryUrl, metadata, key }) {
  await rm(directoryUrl, { recursive: true, force: true });
  await mkdir(directoryUrl, { recursive: true });
  const tiles = [];
  for (const [id, rows] of [...rowsByTile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const output = {
      metadata: {
        ...metadata,
        tile: id,
        recordCount: rows.length
      },
      [key]: rows
    };
    const fileUrl = new URL(`${id}.json`, directoryUrl);
    await writeFile(fileUrl, JSON.stringify(output));
    tiles.push({ id, file: `${id}.json`, count: rows.length, bytes: (await stat(fileUrl)).size });
  }
  return tiles;
}

async function main() {
  const [airportPayload, airspacePayload] = await Promise.all([
    readFile(airportInputUrl, "utf8").then(JSON.parse),
    readFile(airspaceInputUrl, "utf8").then(JSON.parse)
  ]);

  const generatedAt = new Date().toISOString();
  const airportRowsByTile = new Map();
  for (const airport of airportPayload.airports || []) {
    if (!Number.isFinite(Number(airport.lat)) || !Number.isFinite(Number(airport.lon))) continue;
    addToTile(airportRowsByTile, tileIdFor(airport.lat, airport.lon), airport);
  }

  const airspaceRowsByTile = new Map();
  for (const airspace of airspacePayload.airspaces || []) {
    const bbox = Array.isArray(airspace.bbox) ? airspace.bbox : bboxForRings(airspace.rings);
    if (!bbox) continue;
    const row = { ...airspace, bbox };
    for (const id of tileIdsForBbox(bbox)) addToTile(airspaceRowsByTile, id, row);
  }

  const airportTiles = await writeTileSet({
    rowsByTile: airportRowsByTile,
    directoryUrl: airportTileDirUrl,
    key: "airports",
    metadata: {
      dataset: "ADSB Radar tiled offline airports",
      schemaVersion: 1,
      sourceDataset: airportPayload.metadata?.dataset || "offline-airports.json",
      sourceGeneratedAt: airportPayload.metadata?.generatedAt || null,
      generatedAt,
      tileDegrees
    }
  });

  const airspaceTiles = await writeTileSet({
    rowsByTile: airspaceRowsByTile,
    directoryUrl: airspaceTileDirUrl,
    key: "airspaces",
    metadata: {
      dataset: "ADSB Radar tiled offline airspace",
      schemaVersion: 1,
      sourceDataset: airspacePayload.metadata?.dataset || "offline-airspace.json",
      sourceGeneratedAt: airspacePayload.metadata?.generatedAt || null,
      generatedAt,
      tileDegrees
    }
  });

  const index = {
    metadata: {
      dataset: "ADSB Radar offline tile index",
      schemaVersion: 1,
      generatedAt,
      tileDegrees,
      airports: {
        source: "public/data/offline-airports.json",
        count: airportPayload.airports?.length || 0,
        tileCount: airportTiles.length
      },
      airspace: {
        source: "public/data/offline-airspace.json",
        count: airspacePayload.airspaces?.length || 0,
        tileCount: airspaceTiles.length
      }
    },
    airports: Object.fromEntries(airportTiles.map((tile) => [tile.id, { file: `airports/${tile.file}`, count: tile.count, bytes: tile.bytes }])),
    airspace: Object.fromEntries(airspaceTiles.map((tile) => [tile.id, { file: `airspace/${tile.file}`, count: tile.count, bytes: tile.bytes }]))
  };

  await mkdir(tileRootUrl, { recursive: true });
  const indexUrl = new URL("index.json", tileRootUrl);
  await writeFile(indexUrl, JSON.stringify(index));
  const size = (await stat(indexUrl)).size;
  console.log(`Wrote ${path.relative(root.pathname, indexUrl.pathname)}: ${airportTiles.length} airport tiles, ${airspaceTiles.length} airspace tiles, ${size.toLocaleString()} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
