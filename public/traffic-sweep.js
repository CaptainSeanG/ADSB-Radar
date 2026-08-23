function finiteBearing(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeSweepBearing(value) {
  const bearing = finiteBearing(value);
  if (bearing === null) return null;
  return ((bearing % 360) + 360) % 360;
}

export function clockwiseSweepDistance(fromBearing, toBearing) {
  const from = normalizeSweepBearing(fromBearing);
  const to = normalizeSweepBearing(toBearing);
  if (from === null || to === null) return null;
  return (to - from + 360) % 360;
}

export function counterclockwiseSweepDistance(fromBearing, toBearing) {
  const from = normalizeSweepBearing(fromBearing);
  const to = normalizeSweepBearing(toBearing);
  if (from === null || to === null) return null;
  return (from - to + 360) % 360;
}

export function displaySweepBearing(targetBearing, radarRotationDegrees = 0) {
  const target = normalizeSweepBearing(targetBearing);
  const rotation = normalizeSweepBearing(radarRotationDegrees);
  if (target === null || rotation === null) return null;
  return normalizeSweepBearing(target - rotation);
}

export function sweepCrossedBearing(
  previousBearing,
  currentBearing,
  targetBearing,
  { direction = "clockwise", maxSegmentDegrees = 45 } = {}
) {
  const previous = normalizeSweepBearing(previousBearing);
  const current = normalizeSweepBearing(currentBearing);
  const target = normalizeSweepBearing(targetBearing);
  if (previous === null || current === null || target === null) return false;

  const distance =
    direction === "counterclockwise"
      ? counterclockwiseSweepDistance(previous, current)
      : clockwiseSweepDistance(previous, current);
  if (!Number.isFinite(distance) || distance <= 0 || distance > maxSegmentDegrees) return false;

  const targetDistance =
    direction === "counterclockwise"
      ? counterclockwiseSweepDistance(previous, target)
      : clockwiseSweepDistance(previous, target);

  // Exclude the previous beam position so a return is painted exactly once.
  return targetDistance > 1e-7 && targetDistance <= distance + 1e-7;
}

export function sweepPaintDecision(
  state,
  { crossed, confirmedCandidate = null, predictedCandidate = null, fadeStep = 0.2 } = {}
) {
  if (!crossed) return { action: "hold", opacity: state?.opacity ?? 1, candidate: null };

  if (confirmedCandidate) {
    return { action: "confirmed", opacity: 1, candidate: confirmedCandidate };
  }

  if (predictedCandidate) {
    return {
      action: "predicted",
      opacity: Math.max(0.82, Math.min(1, Number(state?.opacity ?? 1))),
      candidate: predictedCandidate
    };
  }

  const opacity = Math.max(0, Number(state?.opacity ?? 1) - Math.max(0, Number(fadeStep) || 0));
  return { action: opacity > 0 ? "fade" : "remove", opacity, candidate: null };
}
