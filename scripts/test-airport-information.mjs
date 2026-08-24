import assert from "node:assert/strict";
import {
  calculateBestWindRunway,
  airportTimeZoneId,
  formatAirportLocalTime,
  formatMetarWind,
  normalizeTpaRemark,
  parseMetarWind
} from "../public/airport-information.js";

function runway(leIdent, leHeading, heIdent, heHeading) {
  return { leIdent, leHeading, heIdent, heHeading, headingReference: "true" };
}

const runway0927 = [runway("09", 90, "27", 270)];
const runway0422 = [runway("04", 40, "22", 220)];

assert.equal(parseMetarWind(null), null);
assert.equal(calculateBestWindRunway(runway0927, null).reason, "unavailable");
assert.equal(formatMetarWind(null), "Current METAR unavailable");

let wind = parseMetarWind({ wdir: 260, wspd: 12, rawOb: "METAR KXXX 232000Z 26012KT 10SM CLR" });
assert.equal(calculateBestWindRunway(runway0927, wind).bestEnds[0].id, "27");

wind = parseMetarWind({ wdir: 50, wspd: 8, rawOb: "METAR KXXX 232000Z 05008KT 10SM CLR" });
assert.equal(calculateBestWindRunway(runway0422, wind).bestEnds[0].id, "04");

wind = parseMetarWind({ rawOb: "METAR KXXX 232000Z 00000KT 10SM CLR" });
assert.equal(wind.calm, true);
assert.equal(calculateBestWindRunway(runway0927, wind).bestEnds.length, 0);

wind = parseMetarWind({ rawOb: "METAR KXXX 232000Z VRB05G12KT 10SM CLR" });
assert.equal(wind.variable, true);
assert.equal(wind.gustKts, 12);
assert.equal(calculateBestWindRunway(runway0927, wind).bestEnds.length, 0);

wind = parseMetarWind({ wdir: 358, wspd: 10 });
assert.equal(calculateBestWindRunway([runway("36", 2, "18", 182)], wind).bestEnds[0].id, "36");

wind = parseMetarWind({ wdir: 270, wspd: 14, wgst: 22 });
assert.equal(formatMetarWind(wind), "Wind 270 deg true at 14 kt, gust 22 kt");

const parallels = [runway("07L", 72, "25R", 252), runway("07R", 75, "25L", 255)];
wind = parseMetarWind({ wdir: 74, wspd: 9 });
assert.deepEqual(calculateBestWindRunway(parallels, wind).bestEnds.map((entry) => entry.id).sort(), ["07L", "07R"]);

const winterDate = new Date("2026-01-15T12:07:00Z");
assert.equal(airportTimeZoneId({ state: "AZ" }), "America/Phoenix");
assert.match(formatAirportLocalTime({ state: "AZ" }, winterDate), /^05:07 MST$/);
assert.match(formatAirportLocalTime({ state: "NY" }, winterDate), /^07:07 EST$/);
assert.equal(
  normalizeTpaRemark("TPA: 1968(1000) LIGHT ACFT & NON-TURBO JETS; 2468(1500) HEAVY ACFT."),
  "1968(1000) LIGHT ACFT & NON-TURBO JETS; 2468(1500) HEAVY ACFT."
);

console.log("Airport METAR and Best Wind tests passed.");
