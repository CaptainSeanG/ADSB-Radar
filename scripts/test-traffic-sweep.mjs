import assert from "node:assert/strict";
import {
  displaySweepBearing,
  sweepCrossedBearing,
  sweepPaintDecision
} from "../public/traffic-sweep.js";

const confirmed = { lat: 33.5, lon: -112.0, positionSequence: 2 };
const predicted = { lat: 33.51, lon: -111.99, predicted: true };

assert.equal(sweepCrossedBearing(20, 80, 90), false, "target must not move before beam arrival");
assert.equal(sweepCrossedBearing(80, 92, 90), true, "target must update when beam crosses 090");
assert.equal(displaySweepBearing(90, 30), 60, "Track Up must gate traffic at its displayed bearing");
assert.equal(displaySweepBearing(5, 350), 15, "display bearing must wrap cleanly through north");
assert.equal(
  sweepPaintDecision({ opacity: 0.4 }, { crossed: true, confirmedCandidate: confirmed }).action,
  "confirmed"
);

const simultaneous = [30, 150, 270];
assert.deepEqual(
  simultaneous.map((bearing) => sweepCrossedBearing(20, 40, bearing)),
  [true, false, false],
  "simultaneous reports must reveal independently by bearing"
);
assert.deepEqual(simultaneous.map((bearing) => sweepCrossedBearing(140, 160, bearing)), [false, true, false]);
assert.deepEqual(simultaneous.map((bearing) => sweepCrossedBearing(260, 280, bearing)), [false, false, true]);

assert.equal(sweepCrossedBearing(358, 4, 2), true, "clockwise wraparound must cross 002 once");
assert.equal(sweepCrossedBearing(4, 8, 2), false, "wrapped target must not be painted twice");
assert.equal(
  sweepCrossedBearing(8, 2, 4, { direction: "counterclockwise" }),
  true,
  "ARC return sweep must support counterclockwise crossings"
);

const predictedDecision = sweepPaintDecision(
  { opacity: 0.9 },
  { crossed: true, predictedCandidate: predicted }
);
assert.equal(predictedDecision.action, "predicted");
assert.equal(predictedDecision.candidate, predicted);
assert.equal(sweepPaintDecision({ opacity: 1 }, { crossed: false, predictedCandidate: predicted }).action, "hold");

const faded = sweepPaintDecision({ opacity: 1 }, { crossed: true, fadeStep: 0.25 });
assert.equal(faded.action, "fade");
assert.equal(faded.opacity, 0.75);
assert.equal(sweepPaintDecision({ opacity: 0.1 }, { crossed: true, fadeStep: 0.25 }).action, "remove");

console.log("Traffic sweep-gating tests passed");
