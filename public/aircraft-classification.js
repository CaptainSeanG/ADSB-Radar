const singlePropTypeCodes = new Set([
  "C150", "C152", "C172", "C182", "C185", "C206", "C210", "DA20", "DA40", "M20P",
  "PA18", "PA24", "PA28", "P28A", "P28R", "P28T", "PA32", "PA46", "SR20", "SR22",
  "S22T", "TBM7", "TBM8", "TBM9", "PC12"
]);

const multiPropTypeCodes = new Set([
  "BE20", "BE30", "BE35", "BE58", "BE60", "BE99", "C310", "C340", "C402", "C411",
  "C421", "C425", "C441", "PA27", "PA30", "PA31", "PA34", "PA44", "PA46T", "PC6", "P46T"
]);

const smallJetTypeCodes = new Set([
  "C500", "C510", "C525", "C550", "C560", "C56X", "C650", "E50P", "E55P", "FA50",
  "G150", "H25B", "LJ35", "LJ45", "LJ60", "PC24", "SF50"
]);

const largeJetTypeCodes = new Set([
  "A20N", "A21N", "A319", "A320", "A321", "A332", "A333", "A359", "B38M", "B39M",
  "B737", "B738", "B739", "B752", "B763", "B772", "B77W", "B788", "B789", "BCS3",
  "E135", "E140", "E145", "E170", "E175", "E190", "E195", "E75", "E75L", "E75S",
  "E295", "CRJ7", "CRJ9", "CRJX"
]);

const helicopterTypeCodes = new Set([
  "A109", "A119", "A139", "A169", "A189", "AS50", "B06", "B06T", "EC35", "EC45",
  "H500", "H60", "R22", "R44", "R66"
]);

export const aircraftIconClass = Object.freeze({
  SINGLE_PROP: "single_prop",
  MULTI_PROP: "multi_prop",
  SMALL_JET: "small_jet",
  LARGE_JET: "large_jet",
  HELICOPTER: "helicopter",
  UNKNOWN: "unknown"
});

const classificationCache = new Map();

function aircraftTypeCode(plane) {
  const value = plane?.aircraftTypeCode || plane?.displayType || plane?.type || plane?.resolvedType || "";
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function classifyAircraftForRadar(plane = {}) {
  const code = aircraftTypeCode(plane);
  const category = String(plane.aircraftCategory || plane.category || "").trim().toUpperCase();
  const manufacturerModel = `${plane.manufacturer || ""} ${plane.model || ""}`.trim().toUpperCase();
  const cacheKey = `${code}|${category}|${manufacturerModel}`;
  if (classificationCache.has(cacheKey)) return classificationCache.get(cacheKey);

  let classification = aircraftIconClass.UNKNOWN;
  if (helicopterTypeCodes.has(code) || /ROTORCRAFT|HELICOPTER|GYROCOPTER/.test(category)) {
    classification = aircraftIconClass.HELICOPTER;
  } else if (largeJetTypeCodes.has(code)) {
    classification = aircraftIconClass.LARGE_JET;
  } else if (smallJetTypeCodes.has(code)) {
    classification = aircraftIconClass.SMALL_JET;
  } else if (multiPropTypeCodes.has(code)) {
    classification = aircraftIconClass.MULTI_PROP;
  } else if (singlePropTypeCodes.has(code)) {
    classification = aircraftIconClass.SINGLE_PROP;
  } else if (/ROBINSON|BELL HELICOPTER|EUROCOPTER|SIKORSKY|AIRBUS HELICOPTERS/.test(manufacturerModel)) {
    classification = aircraftIconClass.HELICOPTER;
  }

  classificationCache.set(cacheKey, classification);
  return classification;
}

export function aircraftIconClassLabel(classification) {
  return {
    [aircraftIconClass.SINGLE_PROP]: "Single-engine prop",
    [aircraftIconClass.MULTI_PROP]: "Multi-engine prop",
    [aircraftIconClass.SMALL_JET]: "Small jet",
    [aircraftIconClass.LARGE_JET]: "Large jet",
    [aircraftIconClass.HELICOPTER]: "Helicopter"
  }[classification] || "";
}

export function clearAircraftClassificationCache() {
  classificationCache.clear();
}
