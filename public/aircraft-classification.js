export const aircraftIconClass = Object.freeze({
  SINGLE_PROP: "single_prop",
  MULTI_PROP: "multi_prop",
  SMALL_JET: "small_jet",
  LARGE_JET: "large_jet",
  HELICOPTER: "helicopter",
  UNKNOWN: "unknown"
});

const singlePropTypeCodes = new Set([
  "AA1", "AA5", "AG5B", "AP22", "BE23", "BE24", "BE33", "BE35", "BE36", "B36T",
  "C150", "C152", "C162", "C170", "C172", "C175", "C177", "C180", "C182", "C185",
  "C188", "C205", "C206", "C207", "C208", "C210", "DA20", "DA40", "M20P", "M20T",
  "P210", "PA18", "PA24", "PA28", "P28A", "P28R", "P28T", "PA32", "PA38", "PA46",
  "PA46T", "P46T", "PC12", "S22T", "SR20", "SR22", "T206", "T210", "TBM7", "TBM8", "TBM9"
]);

const multiPropTypeCodes = new Set([
  "AC11", "AC50", "AC52", "AC56", "AC68", "AC69", "AC80", "AC90", "B190", "B350", "BE10", "BE20",
  "BE30", "BE55", "BE58", "BE60", "BE9L", "BE9T", "BE99", "C310", "C320", "C335", "C340",
  "C401", "C402", "C404", "C411", "C414", "C421", "C425", "C441", "DA42", "DA62", "PA27",
  "PA30", "PA31", "PA34", "PA44", "SW2", "SW3", "SW4"
]);

const smallJetTypeCodes = new Set([
  "BE40", "C25A", "C25B", "C25C", "C500", "C501", "C510", "C525", "C526", "C550", "C551",
  "C560", "C56X", "C650", "C680", "C68A", "C68B", "C700", "CL30", "CL35", "CL60", "E50P",
  "E55P", "FA50", "FA7X", "FA8X", "G150", "G280", "G450", "G500", "G600", "G650", "GLEX",
  "GLF2", "GLF3", "GLF4", "GLF5", "GLF6", "GL7T", "H25B", "HA4T", "HDJT", "LJ24", "LJ25",
  "LJ31", "LJ35", "LJ40", "LJ45", "LJ55", "LJ60", "LJ70", "LJ75", "PC24", "PRM1", "SF50"
]);

const largeJetTypeCodes = new Set([
  "A20N", "A21N", "A318", "A319", "A320", "A321", "A332", "A333", "A338", "A339", "A342",
  "A343", "A345", "A346", "A359", "A35K", "A388", "B38M", "B39M", "B712", "B721", "B722",
  "B732", "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B744", "B748", "B752",
  "B753", "B762", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789", "B78X",
  "BCS1", "BCS3", "CRJ2", "CRJ7", "CRJ9", "CRJX", "E135", "E140", "E145", "E170", "E175",
  "E190", "E195", "E275", "E290", "E295", "E75", "E75L", "E75S", "MD11", "MD81", "MD82",
  "MD83", "MD87", "MD88", "MD90"
]);

const helicopterTypeCodes = new Set([
  "A109", "A119", "A139", "A169", "A189", "AS50", "AS55", "B06", "B06L", "B06T", "B407",
  "B412", "B429", "B505", "EC30", "EC35", "EC45", "H125", "H135", "H145", "H500", "H60",
  "R22", "R44", "R66", "S76", "UH1"
]);

const classificationCache = new Map();

function normalizedCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizedWords(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function classifyKnownCode(value) {
  const code = normalizedCode(value);
  if (!code) return aircraftIconClass.UNKNOWN;
  if (helicopterTypeCodes.has(code)) return aircraftIconClass.HELICOPTER;
  if (largeJetTypeCodes.has(code)) return aircraftIconClass.LARGE_JET;
  if (smallJetTypeCodes.has(code)) return aircraftIconClass.SMALL_JET;
  if (multiPropTypeCodes.has(code)) return aircraftIconClass.MULTI_PROP;
  if (singlePropTypeCodes.has(code)) return aircraftIconClass.SINGLE_PROP;
  if (/^(AS350|EC(30|35|45)|H(125|135|145)|R(22|44|66))/.test(code)) return aircraftIconClass.HELICOPTER;
  if (/^PA(34|44)/.test(code) || /^DA(42|62)/.test(code)) return aircraftIconClass.MULTI_PROP;
  if (/^C(310|320|335|340|401|402|404|414|421)/.test(code)) return aircraftIconClass.MULTI_PROP;
  if (/^PA(24|28|32|38|46)/.test(code) || /^P28[ART]/.test(code)) return aircraftIconClass.SINGLE_PROP;
  if (/^C(150|152|162|170|172|175|177|180|182|185|188|206|207|208|210)/.test(code)) return aircraftIconClass.SINGLE_PROP;
  if (/^(SR(20|22)|S22T|DA(20|40)|M20|BE(23|24|33|35|36))/.test(code)) return aircraftIconClass.SINGLE_PROP;
  return aircraftIconClass.UNKNOWN;
}

function classifyManufacturerModel(manufacturerValue, modelValue, categoryValue) {
  const manufacturer = normalizedWords(manufacturerValue);
  const model = normalizedWords(modelValue);
  const compactModel = normalizedCode(modelValue);
  const category = normalizedWords(categoryValue);

  if (/ROTORCRAFT|HELICOPTER|GYROCOPTER/.test(category)) {
    return { classification: aircraftIconClass.HELICOPTER, reason: `FAA category ${category}` };
  }

  const directModel = classifyKnownCode(compactModel);
  if (directModel !== aircraftIconClass.UNKNOWN) {
    return { classification: directModel, reason: `FAA model designator ${compactModel}` };
  }

  const helicopterMaker = /ROBINSON|BELL HELICOPTER|EUROCOPTER|SIKORSKY|AIRBUS HELICOPTERS|AGUSTA|LEONARDO HELICOPTER/.test(manufacturer);
  if (helicopterMaker && /R22|R44|R66|206|407|412|429|505|AS350|H125|EC130|EC135|H135|EC145|H145|S76|UH1|H60/.test(compactModel)) {
    return { classification: aircraftIconClass.HELICOPTER, reason: `FAA helicopter family ${manufacturer} ${model}` };
  }

  if (/BOEING/.test(manufacturer) && /^(717|727|737|747|757|767|777|787)/.test(compactModel)) {
    return { classification: aircraftIconClass.LARGE_JET, reason: `FAA Boeing jet family ${model}` };
  }
  if (/AIRBUS/.test(manufacturer) && /^(A?31[89]|A?32[01]|A?33[02389]|A?34[2356]|A?35[09K]|A?380|A?220)/.test(compactModel)) {
    return { classification: aircraftIconClass.LARGE_JET, reason: `FAA Airbus jet family ${model}` };
  }
  if (/EMBRAER|YABORA/.test(manufacturer) && /^(EMB|ERJ)?(135|140|145|170|175|190|195|170200)/.test(compactModel)) {
    return { classification: aircraftIconClass.LARGE_JET, reason: `FAA Embraer regional jet family ${model}` };
  }
  if (/BOMBARDIER|CANADAIR/.test(manufacturer) && /CRJ|CL6002[ABCD]|REGIONALJET/.test(compactModel)) {
    return { classification: aircraftIconClass.LARGE_JET, reason: `FAA regional jet family ${model}` };
  }
  if (/MCDONNELL|DOUGLAS/.test(manufacturer) && /MD(8[0-9]|9[0-9]|11)/.test(compactModel)) {
    return { classification: aircraftIconClass.LARGE_JET, reason: `FAA McDonnell Douglas jet family ${model}` };
  }

  if (/CESSNA|TEXTRON AVIATION/.test(manufacturer)) {
    if (/^(500|501|510|525|526|550|551|560|650|680|700|750)|CITATION/.test(compactModel)) {
      return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Cessna Citation family ${model}` };
    }
    if (/^(310|320|335|340|401|402|404|411|414|421|425|441)/.test(compactModel)) {
      return { classification: aircraftIconClass.MULTI_PROP, reason: `FAA Cessna twin family ${model}` };
    }
    if (/^[RTP]?(150|152|162|170|172|175|177|180|182|185|188|205|206|207|208|210)/.test(compactModel)) {
      return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Cessna single family ${model}` };
    }
  }

  if (/PIPER/.test(manufacturer)) {
    if (/^PA(34|44)/.test(compactModel)) {
      return { classification: aircraftIconClass.MULTI_PROP, reason: `FAA Piper twin family ${model}` };
    }
    if (/^PA(24|28|32|38|46)/.test(compactModel)) {
      return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Piper single family ${model}` };
    }
  }

  if (/BEECH|HAWKER BEECHCRAFT|RAYTHEON/.test(manufacturer)) {
    if (/^(4000|HAWKER)|PREMIER/.test(compactModel)) {
      return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Beech/Hawker jet family ${model}` };
    }
    if (/^(55|56|58|60|65|76|90|99|100|200|300|B?300|B?350)|KINGAIR|BARON/.test(compactModel)) {
      return { classification: aircraftIconClass.MULTI_PROP, reason: `FAA Beech twin family ${model}` };
    }
    if (/^(19|23|24|33|35|36|A36|B36|F33|V35)|BONANZA/.test(compactModel)) {
      return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Beech single family ${model}` };
    }
  }

  if (/DIAMOND/.test(manufacturer)) {
    if (/^DA(42|62)/.test(compactModel)) return { classification: aircraftIconClass.MULTI_PROP, reason: `FAA Diamond twin family ${model}` };
    if (/^DA(20|40)/.test(compactModel)) return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Diamond single family ${model}` };
  }
  if (/CIRRUS/.test(manufacturer)) {
    if (/SF50|VISIONJET/.test(compactModel)) return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Cirrus jet family ${model}` };
    if (/SR(20|22)/.test(compactModel)) return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Cirrus single family ${model}` };
  }
  if (/MOONEY/.test(manufacturer) && /M20/.test(compactModel)) {
    return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Mooney M20 family ${model}` };
  }
  if (/GRUMMAN|AMERICAN GENERAL|AMERICAN AVIATION/.test(manufacturer) && /^(AA1|AA5|AG5)/.test(compactModel)) {
    return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Grumman/American single family ${model}` };
  }
  if (/PILATUS/.test(manufacturer)) {
    if (/PC24/.test(compactModel)) return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Pilatus PC-24 family ${model}` };
    if (/PC12/.test(compactModel)) return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA Pilatus PC-12 family ${model}` };
  }
  if (/SOCATA|DAHER/.test(manufacturer) && /TBM/.test(compactModel)) {
    return { classification: aircraftIconClass.SINGLE_PROP, reason: `FAA TBM family ${model}` };
  }
  if (/FAIRCHILD|SWEARINGEN/.test(manufacturer) && /SA22[67]|METRO/.test(compactModel)) {
    return { classification: aircraftIconClass.MULTI_PROP, reason: `FAA Metro twin family ${model}` };
  }

  if (/LEARJET/.test(manufacturer) && /^(24|25|31|35|40|45|55|60|70|75)/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Learjet family ${model}` };
  }
  if (/GULFSTREAM|ISRAEL AIRCRAFT|IAI LTD/.test(manufacturer) && /GULFSTREAM|G(150|200|280|400|450|500|550|600|650|700|800)|GII|GIII|GIV|GV|GVI|GVII/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Gulfstream family ${model}` };
  }
  if (/DASSAULT/.test(manufacturer) && /FALCON|^(50|7X|8X|900|2000)/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Falcon family ${model}` };
  }
  if (/HONDA/.test(manufacturer) && /HA420|HONDAJET/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA HondaJet family ${model}` };
  }
  if (/EMBRAER/.test(manufacturer) && /EMB(500|505)|PHENOM(100|300)/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Phenom family ${model}` };
  }
  if (/BOMBARDIER|CANADAIR/.test(manufacturer) && /CHALLENGER|CL(300|350|600|604|605|650)/.test(compactModel)) {
    return { classification: aircraftIconClass.SMALL_JET, reason: `FAA Challenger family ${model}` };
  }

  return { classification: aircraftIconClass.UNKNOWN, reason: "no confident FAA manufacturer/model family match" };
}

function classifyNormalizedDescription(value) {
  const direct = classifyKnownCode(value);
  if (direct !== aircraftIconClass.UNKNOWN) return direct;
  const words = normalizedWords(value);
  for (const token of words.split(" ")) {
    const classification = classifyKnownCode(token);
    if (classification !== aircraftIconClass.UNKNOWN) return classification;
  }

  const knownManufacturers = [
    ["CESSNA", /CESSNA|TEXTRON AVIATION/],
    ["PIPER", /PIPER/],
    ["BEECH", /BEECH|HAWKER BEECHCRAFT|RAYTHEON/],
    ["DIAMOND", /DIAMOND/],
    ["CIRRUS", /CIRRUS/],
    ["MOONEY", /MOONEY/],
    ["BOEING", /BOEING/],
    ["AIRBUS", /AIRBUS/],
    ["EMBRAER", /EMBRAER/],
    ["BOMBARDIER", /BOMBARDIER|CANADAIR/],
    ["LEARJET", /LEARJET/],
    ["GULFSTREAM", /GULFSTREAM/],
    ["DASSAULT", /DASSAULT/],
    ["ROBINSON", /ROBINSON/]
  ];
  for (const [manufacturer, pattern] of knownManufacturers) {
    if (!pattern.test(words)) continue;
    const model = words.replace(pattern, "").trim();
    return classifyManufacturerModel(manufacturer, model, "").classification;
  }
  return aircraftIconClass.UNKNOWN;
}

function reliableTypeCandidates(plane) {
  return [
    ["aircraftTypeCode", plane.aircraftTypeCode],
    ["icaoType", plane.icaoType || plane.icao_type],
    ["TAIS type", plane.taisAircraftType || plane.taisType || plane.rawAircraftType]
  ].filter(([, value]) => normalizedCode(value));
}

function normalizedTypeCandidates(plane) {
  return [
    ["resolvedType", plane.resolvedType],
    ["type", plane.type],
    ["displayType", plane.displayType],
    ["friendlyType", plane.friendlyType]
  ].filter(([, value]) => normalizedCode(value));
}

function classificationCacheKey(plane) {
  return [
    ...reliableTypeCandidates(plane).flat(),
    plane.manufacturer,
    plane.model,
    plane.aircraftCategory || plane.category,
    ...normalizedTypeCandidates(plane).flat()
  ].map((value) => normalizedWords(value)).join("|");
}

export function classifyAircraftForRadarDetailed(plane = {}) {
  const cacheKey = classificationCacheKey(plane);
  if (classificationCache.has(cacheKey)) return classificationCache.get(cacheKey);

  const reliableCandidates = reliableTypeCandidates(plane);
  for (const [source, value] of reliableCandidates) {
    const classification = classifyKnownCode(value);
    if (classification !== aircraftIconClass.UNKNOWN) {
      const result = {
        classification,
        reason: `reliable ${source} designator ${normalizedCode(value)}`,
        matchedSource: source,
        matchedValue: String(value),
        normalized: normalizedCode(value)
      };
      classificationCache.set(cacheKey, result);
      return result;
    }
  }

  const faaResult = classifyManufacturerModel(
    plane.manufacturer,
    plane.model,
    plane.aircraftCategory || plane.category
  );
  if (faaResult.classification !== aircraftIconClass.UNKNOWN) {
    const result = {
      ...faaResult,
      matchedSource: "FAA manufacturer/model",
      matchedValue: `${plane.manufacturer || ""} ${plane.model || ""}`.trim(),
      normalized: `${normalizedWords(plane.manufacturer)} ${normalizedWords(plane.model)}`.trim()
    };
    classificationCache.set(cacheKey, result);
    return result;
  }

  const normalizedCandidates = normalizedTypeCandidates(plane);
  for (const [source, value] of normalizedCandidates) {
    const classification = classifyNormalizedDescription(value);
    if (classification !== aircraftIconClass.UNKNOWN) {
      const result = {
        classification,
        reason: `normalized ${source} designator ${normalizedCode(value)}`,
        matchedSource: source,
        matchedValue: String(value),
        normalized: normalizedCode(value)
      };
      classificationCache.set(cacheKey, result);
      return result;
    }
  }

  const result = {
    classification: aircraftIconClass.UNKNOWN,
    reason: faaResult.reason,
    matchedSource: "none",
    matchedValue: "",
    normalized: {
      reliableTypes: reliableCandidates.map(([source, value]) => `${source}:${normalizedCode(value)}`),
      faaManufacturer: normalizedWords(plane.manufacturer),
      faaModel: normalizedWords(plane.model),
      normalizedTypes: normalizedCandidates.map(([source, value]) => `${source}:${normalizedCode(value)}`)
    }
  };
  classificationCache.set(cacheKey, result);
  return result;
}

export function classifyAircraftForRadar(plane = {}) {
  return classifyAircraftForRadarDetailed(plane).classification;
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
