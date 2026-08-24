import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assets = {
  "single-prop.svg": "cessna.svg",
  "multi-prop.svg": "dh8a.svg",
  "small-jet.svg": "learjet.svg",
  "large-jet.svg": "b737.svg",
  "helicopter.svg": "a7.svg"
};

for (const [filename, source] of Object.entries(assets)) {
  const svg = await readFile(new URL(`../public/assets/aircraft/${filename}`, import.meta.url), "utf8");
  assert.match(svg, /<svg\b/i, `${filename} must contain an SVG root`);
  assert.match(svg, /viewBox=/i, `${filename} must define a viewBox`);
  assert.match(svg, /<path\b/i, `${filename} must contain a silhouette path`);
  console.log(`${filename}: supplied source ${source}`);
}

const attribution = await readFile(new URL("../docs/AIRCRAFT_ICONS_ATTRIBUTION.md", import.meta.url), "utf8");
assert.match(attribution, /adsb-radar\.com/i, "icon attribution backlink must be preserved");
console.log("Aircraft SVG asset tests passed.");
