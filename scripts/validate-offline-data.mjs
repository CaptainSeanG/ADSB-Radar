#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";

const airportsPath = new URL("../public/data/offline-airports.json", import.meta.url);
const airspacePath = new URL("../public/data/offline-airspace.json", import.meta.url);

const expectedAirports = ["KPHX", "KLAX", "KJFK", "KORD", "KATL", "KSEA", "PANC", "PHNL", "TJSJ"];
const expectedClassB = [
  ["PHX", "PHOENIX"],
  ["LAX", "LOS ANGELES"],
  ["N90", "NEW YORK"],
  ["ORD", "CHICAGO"],
  ["ATL", "ATLANTA"],
  ["SEA", "SEATTLE"]
];
const coverageChecks = [
  { name: "Los Angeles", lat: 33.9416, lon: -118.4085 },
  { name: "New York", lat: 40.6413, lon: -73.7781 },
  { name: "Anchorage", lat: 61.1744, lon: -149.9964 },
  { name: "Honolulu", lat: 21.3187, lon: -157.9224 }
];

function milesBetween(latA, lonA, latB, lonB) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

function bboxIntersectsPointRadius(bbox, lat, lon, radiusMiles) {
  const [west, south, east, north] = bbox.map(Number);
  const latPad = radiusMiles / 69;
  const lonPad = radiusMiles / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return east >= lon - lonPad && west <= lon + lonPad && north >= lat - latPad && south <= lat + latPad;
}

function validateAltitude(text) {
  return text === "SFC" || text === "UNLTD" || text === "--" || /^-?[0-9]+$/.test(String(text));
}

const airportsData = JSON.parse(await readFile(airportsPath, "utf8"));
const airspaceData = JSON.parse(await readFile(airspacePath, "utf8"));
const airports = airportsData.airports || [];
const airspaces = airspaceData.airspaces || [];
const errors = [];

const airportIds = new Set();
for (const airport of airports) {
  if (airportIds.has(airport.ident)) errors.push(`Duplicate airport ident ${airport.ident}`);
  airportIds.add(airport.ident);
  if (!Number.isFinite(airport.lat) || airport.lat < -90 || airport.lat > 90) errors.push(`Invalid latitude for ${airport.ident}`);
  if (!Number.isFinite(airport.lon) || airport.lon < -180 || airport.lon > 180) errors.push(`Invalid longitude for ${airport.ident}`);
}
for (const ident of expectedAirports) {
  if (!airportIds.has(ident)) errors.push(`Missing expected airport ${ident}`);
}

const classBText = airspaces
  .filter((airspace) => airspace.classCode === "B")
  .map((airspace) => `${airspace.ident} ${airspace.icao} ${airspace.name}`.toUpperCase());
for (const aliases of expectedClassB) {
  if (!classBText.some((text) => aliases.some((alias) => text.includes(alias)))) {
    errors.push(`Missing expected Class B ${aliases.join("/")}`);
  }
}

for (const airspace of airspaces) {
  if (!["B", "C", "D", "E"].includes(airspace.classCode)) errors.push(`Unexpected class ${airspace.classCode}`);
  if (!validateAltitude(airspace.lower) || !validateAltitude(airspace.upper)) {
    errors.push(`Bad floor/ceiling for ${airspace.id}`);
  }
  if (!Array.isArray(airspace.bbox) || airspace.bbox.length !== 4) errors.push(`Missing bbox for ${airspace.id}`);
  if (!Array.isArray(airspace.rings) || !airspace.rings.length) errors.push(`Missing rings for ${airspace.id}`);
  for (const ring of airspace.rings || []) {
    if (!Array.isArray(ring) || ring.length < 3) errors.push(`Invalid ring for ${airspace.id}`);
    for (const point of ring) {
      if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) errors.push(`Invalid airspace lat ${airspace.id}`);
      if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) errors.push(`Invalid airspace lon ${airspace.id}`);
    }
  }
}

for (const check of coverageChecks) {
  const nearbyAirports = airports.filter((airport) => milesBetween(check.lat, check.lon, airport.lat, airport.lon) <= 60);
  const nearbyAirspaces = airspaces.filter((airspace) => bboxIntersectsPointRadius(airspace.bbox, check.lat, check.lon, 100));
  if (!nearbyAirports.length) errors.push(`No nearby airports found for ${check.name}`);
  if (!nearbyAirspaces.length) errors.push(`No nearby airspace found for ${check.name}`);
  console.log(`${check.name}: ${nearbyAirports.length} airports within 60 mi, ${nearbyAirspaces.length} airspace features near 100 mi view`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const airportSize = (await stat(airportsPath)).size;
const airspaceSize = (await stat(airspacePath)).size;
console.log(`Validated ${airports.length} airports (${airportSize.toLocaleString()} bytes)`);
console.log(`Validated ${airspaces.length} airspace features (${airspaceSize.toLocaleString()} bytes)`);
