import assert from "node:assert/strict";
import {
  aircraftIconClass,
  classifyAircraftForRadar,
  classifyAircraftForRadarDetailed,
  clearAircraftClassificationCache
} from "../public/aircraft-classification.js";

const cases = [
  // Single-engine prop designators and FAA manufacturer/model variants.
  [{ rawAircraftType: "C172S" }, aircraftIconClass.SINGLE_PROP],
  [{ rawAircraftType: "C172" }, aircraftIconClass.SINGLE_PROP],
  [{ manufacturer: "CESSNA", model: "172S", aircraftCategory: "Fixed wing single engine" }, aircraftIconClass.SINGLE_PROP],
  [{ manufacturer: "Cessna", model: "182T" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "C182T" }, aircraftIconClass.SINGLE_PROP],
  [{ manufacturer: "PIPER", model: "PA-28-181" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "PA-28-181" }, aircraftIconClass.SINGLE_PROP],
  [{ manufacturer: "Piper", model: "PA 28 181" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "P28A" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "SR22" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "BE36" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "DA40" }, aircraftIconClass.SINGLE_PROP],
  [{ type: "PC12" }, aircraftIconClass.SINGLE_PROP],

  // Multi-engine prop.
  [{ type: "PA44" }, aircraftIconClass.MULTI_PROP],
  [{ type: "BE58" }, aircraftIconClass.MULTI_PROP],
  [{ type: "C310" }, aircraftIconClass.MULTI_PROP],
  [{ type: "C421" }, aircraftIconClass.MULTI_PROP],
  [{ type: "DA42" }, aircraftIconClass.MULTI_PROP],
  [{ type: "B350" }, aircraftIconClass.MULTI_PROP],

  // Small/business jet.
  [{ type: "C525" }, aircraftIconClass.SMALL_JET],
  [{ type: "C56X" }, aircraftIconClass.SMALL_JET],
  [{ type: "LJ45" }, aircraftIconClass.SMALL_JET],
  [{ type: "E55P" }, aircraftIconClass.SMALL_JET],
  [{ type: "HDJT" }, aircraftIconClass.SMALL_JET],
  [{ manufacturer: "HAWKER BEECHCRAFT CORP", model: "4000" }, aircraftIconClass.SMALL_JET],

  // Airliner and regional jet.
  [{ type: "B738" }, aircraftIconClass.LARGE_JET],
  [{ type: "B739" }, aircraftIconClass.LARGE_JET],
  [{ type: "A320" }, aircraftIconClass.LARGE_JET],
  [{ type: "A321" }, aircraftIconClass.LARGE_JET],
  [{ type: "E75L" }, aircraftIconClass.LARGE_JET],
  [{ type: "CRJ9" }, aircraftIconClass.LARGE_JET],
  [{ type: "B77W" }, aircraftIconClass.LARGE_JET],

  // Helicopter.
  [{ type: "R44" }, aircraftIconClass.HELICOPTER],
  [{ type: "B06" }, aircraftIconClass.HELICOPTER],
  [{ type: "AS50" }, aircraftIconClass.HELICOPTER],
  [{ type: "AS350" }, aircraftIconClass.HELICOPTER],
  [{ type: "H125" }, aircraftIconClass.HELICOPTER],
  [{ aircraftCategory: "Rotorcraft" }, aircraftIconClass.HELICOPTER],

  // Unknown/fallback remains conservative.
  [{ type: "UNKNOWN" }, aircraftIconClass.UNKNOWN],
  [{ type: "???", manufacturer: "EXPERIMENTAL", model: "CUSTOM" }, aircraftIconClass.UNKNOWN],
  [{ sourceType: "faa-tais-p50", faaTrackNumber: "123" }, aircraftIconClass.UNKNOWN]
];

for (const [plane, expected] of cases) {
  assert.equal(classifyAircraftForRadar(plane), expected, `${JSON.stringify(plane)} should classify as ${expected}`);
}

const requiredFamilies = {
  [aircraftIconClass.SINGLE_PROP]: [
    "C150", "C152", "C162", "C170", "C172", "C175", "C177", "C180", "C182", "C185", "C188", "C206",
    "C207", "C208", "C210", "P28A", "PA24", "PA28", "PA32", "PA38", "PA46", "SR20", "SR22", "S22T",
    "BE23", "BE24", "BE33", "BE35", "BE36", "M20P", "DA20", "DA40", "PC12"
  ],
  [aircraftIconClass.MULTI_PROP]: [
    "PA44", "PA34", "BE55", "BE58", "BE60", "C310", "C320", "C335", "C340", "C401", "C402", "C404",
    "C414", "C421", "DA42", "DA62", "AC11", "AC50", "AC90", "BE20", "B350", "SW4"
  ],
  [aircraftIconClass.SMALL_JET]: [
    "C500", "C501", "C510", "C525", "C550", "C560", "C56X", "C650", "C680", "C700", "LJ24", "LJ25",
    "LJ31", "LJ35", "LJ40", "LJ45", "LJ55", "LJ60", "LJ70", "LJ75", "E50P", "E55P", "HDJT", "GLF2",
    "GLF5", "GLEX", "G280", "G450", "G500", "G600", "G650", "CL30", "CL35", "CL60", "FA50", "FA7X",
    "FA8X", "H25B", "PRM1"
  ],
  [aircraftIconClass.LARGE_JET]: [
    "B712", "B721", "B722", "B732", "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B744",
    "B748", "B752", "B753", "B762", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789",
    "B78X", "A318", "A319", "A320", "A321", "A332", "A333", "A338", "A339", "A342", "A343", "A345",
    "A346", "A359", "A35K", "A388", "E170", "E175", "E75L", "E75S", "E190", "E195", "CRJ2", "CRJ7",
    "CRJ9", "CRJX", "MD81", "MD88", "MD90", "BCS1", "BCS3"
  ],
  [aircraftIconClass.HELICOPTER]: [
    "R22", "R44", "R66", "B06", "B407", "B429", "AS50", "AS350", "EC30", "EC35", "EC45", "H125",
    "H135", "H145", "S76", "UH1", "H60"
  ]
};

let requiredFamilyCaseCount = 0;
for (const [expected, codes] of Object.entries(requiredFamilies)) {
  for (const code of codes) {
    requiredFamilyCaseCount += 1;
    assert.equal(classifyAircraftForRadar({ type: code }), expected, `${code} should classify as ${expected}`);
  }
}

// A reliable TAIS/ICAO designator must win even after FAA displayType enrichment adds a descriptive model.
const enrichedAirliner = {
  rawAircraftType: "B763",
  type: "B763",
  displayType: "767-300F",
  manufacturer: "BOEING",
  model: "767-300F",
  aircraftCategory: "Fixed wing multi engine"
};
assert.equal(classifyAircraftForRadar(enrichedAirliner), aircraftIconClass.LARGE_JET);
assert.match(classifyAircraftForRadarDetailed(enrichedAirliner).reason, /reliable TAIS type designator B763/);

// FAA family recognition handles model punctuation without requiring a type designator.
assert.equal(
  classifyAircraftForRadar({ manufacturer: "PIPER", model: "PA-28R-201T", displayType: "PA-28R-201T" }),
  aircraftIconClass.SINGLE_PROP
);
assert.equal(classifyAircraftForRadar({ displayType: "Cessna 172S" }), aircraftIconClass.SINGLE_PROP);
assert.equal(classifyAircraftForRadar({ friendlyType: "Boeing 767-300F" }), aircraftIconClass.LARGE_JET);
assert.equal(
  classifyAircraftForRadar({ rawAircraftType: "SW4", manufacturer: "FAIRCHILD", model: "SA227-DC" }),
  aircraftIconClass.MULTI_PROP
);

clearAircraftClassificationCache();
assert.equal(classifyAircraftForRadar({ type: "C172" }), aircraftIconClass.SINGLE_PROP, "classification remains deterministic after cache reset");

console.log(`Aircraft classification tests passed (${cases.length + requiredFamilyCaseCount + 5} deterministic cases).`);
