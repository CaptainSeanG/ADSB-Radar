function finiteTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed > 100000000000 ? parsed : parsed * 1000;
}

export function sourcePositionTimestamp(plane) {
  return (
    finiteTimestamp(plane?.positionObservedAt) ??
    finiteTimestamp(plane?.updatedAt) ??
    finiteTimestamp(plane?.lastSeenAt) ??
    finiteTimestamp(plane?.timestamp)
  );
}

export function coordinatesMateriallyChanged(previousPlane, nextPlane, threshold = 0.00001) {
  if (!previousPlane) return true;
  const previousLat = Number(previousPlane.lat);
  const previousLon = Number(previousPlane.lon);
  const nextLat = Number(nextPlane?.lat);
  const nextLon = Number(nextPlane?.lon);
  if (![previousLat, previousLon, nextLat, nextLon].every(Number.isFinite)) return false;
  return Math.abs(previousLat - nextLat) > threshold || Math.abs(previousLon - nextLon) > threshold;
}

export function classifyInternetPositionObservation(previousState, plane, snapshotId = "") {
  const positionTimestamp = sourcePositionTimestamp(plane);
  const previousTimestamp = Number(previousState?.confirmedTimestamp);
  const hasTrustworthyTimestamp =
    Number.isFinite(positionTimestamp) && plane?.positionTimestampTrusted === true;
  const timestampAdvanced =
    hasTrustworthyTimestamp &&
    (!Number.isFinite(previousTimestamp) || positionTimestamp > previousTimestamp + 1);
  const coordinatesChanged = coordinatesMateriallyChanged(previousState?.pendingPlane, plane);
  const previousSnapshotId = String(previousState?.confirmedSnapshotId || "");
  const normalizedSnapshotId = String(snapshotId || plane?.upstreamSnapshotId || "");
  const repeatedSnapshot = Boolean(
    previousState && normalizedSnapshotId && previousSnapshotId === normalizedSnapshotId
  );

  let isNewPosition = false;
  let reason = "duplicate observation";
  if (!previousState) {
    isNewPosition = true;
    reason = "first observation";
  } else if (repeatedSnapshot) {
    reason = "repeated snapshot ID";
  } else if (timestampAdvanced) {
    isNewPosition = true;
    reason = "source position timestamp advanced";
  } else if (!hasTrustworthyTimestamp && coordinatesChanged) {
    isNewPosition = true;
    reason = "coordinates changed without trustworthy source timestamp";
  } else if (hasTrustworthyTimestamp) {
    reason = "source position timestamp did not advance";
  }

  return {
    isNewPosition,
    reason,
    positionTimestamp,
    hasTrustworthyTimestamp,
    timestampAdvanced,
    coordinatesChanged,
    repeatedSnapshot,
    snapshotId: normalizedSnapshotId
  };
}
