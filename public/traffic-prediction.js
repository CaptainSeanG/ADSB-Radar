export const TRAFFIC_PREDICTION_HORIZON_SECONDS = 6;
export const INTERNET_PREDICTION_HORIZON_SECONDS = TRAFFIC_PREDICTION_HORIZON_SECONDS;
export const TAIS_MOTION_MIN_DISTANCE_NM = 0.01;
export const TAIS_MOTION_MAX_GROUNDSPEED_KTS = 750;
export const TAIS_MOTION_MAX_INTERVAL_SECONDS = 30;

function finiteTrafficNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

export function destinationPointMiles(lat, lon, bearingDegrees, distanceMiles) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const angularDistance = distanceMiles / earthMiles;
  const bearing = toRad(bearingDegrees);
  const latitude = toRad(lat);
  const longitude = toRad(lon);
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude)
    );

  return {
    lat: toDeg(destinationLatitude),
    lon: ((toDeg(destinationLongitude) + 540) % 360) - 180
  };
}

export function distanceMilesBetween(latA, lonA, latB, lonB) {
  const earthMiles = 3958.7613;
  const toRad = (value) => (value * Math.PI) / 180;
  const deltaLatitude = toRad(latB - latA);
  const deltaLongitude = toRad(lonB - lonA);
  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(value));
}

export function initialBearingDegrees(latA, lonA, latB, lonB) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const latitudeA = toRad(latA);
  const latitudeB = toRad(latB);
  const deltaLongitude = toRad(lonB - lonA);
  const east = Math.sin(deltaLongitude) * Math.cos(latitudeB);
  const north =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(deltaLongitude);
  if (!Number.isFinite(east) || !Number.isFinite(north) || Math.hypot(east, north) < 1e-12) {
    return null;
  }
  return ((toDeg(Math.atan2(east, north)) % 360) + 360) % 360;
}

export function trafficSymbolScreenAngleDegrees(trackDegrees, radarRotationDegrees = 0) {
  const track = finiteTrafficNumber(trackDegrees);
  const rotation = finiteTrafficNumber(radarRotationDegrees);
  if (!Number.isFinite(track) || !Number.isFinite(rotation)) return null;
  return ((track - rotation - 90 + 540) % 360) - 180;
}

export function deriveConfirmedMotion(previous, nextPlane, nextTimestamp) {
  const previousTimestamp = finiteTrafficNumber(previous?.confirmedTimestamp);
  const timestamp = finiteTrafficNumber(nextTimestamp);
  const elapsedSeconds = (timestamp - previousTimestamp) / 1000;
  const previousTrack = finiteTrafficNumber(previous?.derivedTrack ?? previous?.confirmedTrack);
  const previousSpeed = finiteTrafficNumber(previous?.derivedGroundSpeed ?? previous?.confirmedGroundSpeed);
  const retained = (reason) => ({
    accepted: false,
    reason,
    track: Number.isFinite(previousTrack) ? previousTrack : null,
    groundspeed: Number.isFinite(previousSpeed) ? previousSpeed : null,
    elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : null,
    distanceNm: null
  });

  if (!previous || !Number.isFinite(previousTimestamp)) return retained("no previous confirmed position");
  if (!Number.isFinite(timestamp) || elapsedSeconds <= 0) return retained("timestamp did not advance");
  if (elapsedSeconds < 0.75 || elapsedSeconds > TAIS_MOTION_MAX_INTERVAL_SECONDS) {
    return retained("observation interval outside derivation window");
  }
  if (String(nextPlane?.altitude ?? "").toLowerCase() === "ground") {
    return retained("ground target");
  }

  const latA = finiteTrafficNumber(previous.confirmedLat);
  const lonA = finiteTrafficNumber(previous.confirmedLon);
  const latB = finiteTrafficNumber(nextPlane?.lat);
  const lonB = finiteTrafficNumber(nextPlane?.lon);
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return retained("invalid coordinates");

  const distanceMiles = distanceMilesBetween(latA, lonA, latB, lonB);
  const distanceNm = distanceMiles * 0.8689762419;
  if (!Number.isFinite(distanceNm) || distanceNm < TAIS_MOTION_MIN_DISTANCE_NM) {
    return { ...retained("movement below position-noise floor"), distanceNm };
  }

  const groundspeed = (distanceNm * 3600) / elapsedSeconds;
  const track = initialBearingDegrees(latA, lonA, latB, lonB);
  if (
    !Number.isFinite(track) ||
    !Number.isFinite(groundspeed) ||
    groundspeed < 1 ||
    groundspeed > TAIS_MOTION_MAX_GROUNDSPEED_KTS
  ) {
    return {
      ...retained("implied motion is physically implausible"),
      distanceNm,
      impliedGroundspeed: groundspeed
    };
  }

  return {
    accepted: true,
    reason: "successive confirmed FAA positions",
    track,
    groundspeed,
    elapsedSeconds,
    distanceNm
  };
}

export function projectConfirmedTraffic(confirmed, displayTimestamp) {
  if (!confirmed || !["internet", "faa"].includes(confirmed.sourceType)) return null;
  if (String(confirmed.confirmedAltitude ?? "").toLowerCase() === "ground") return null;

  const speedKts = finiteTrafficNumber(confirmed.confirmedGroundSpeed);
  const trackDegrees = finiteTrafficNumber(confirmed.confirmedTrack);
  const confirmedTimestamp = finiteTrafficNumber(confirmed.confirmedTimestamp);
  const ageSeconds = (displayTimestamp - confirmedTimestamp) / 1000;
  if (
    !Number.isFinite(speedKts) ||
    speedKts <= 0 ||
    speedKts > 1500 ||
    !Number.isFinite(trackDegrees) ||
    trackDegrees < 0 ||
    trackDegrees > 360 ||
    !Number.isFinite(ageSeconds) ||
    ageSeconds < 0.25 ||
    ageSeconds > TRAFFIC_PREDICTION_HORIZON_SECONDS
  ) {
    return null;
  }

  const distanceMiles = (speedKts / 3600) * ageSeconds * 1.15078;
  const position = destinationPointMiles(
    finiteTrafficNumber(confirmed.confirmedLat),
    finiteTrafficNumber(confirmed.confirmedLon),
    trackDegrees,
    distanceMiles
  );
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lon)) return null;

  const verticalRate = finiteTrafficNumber(confirmed.confirmedVerticalRate);
  const altitude = finiteTrafficNumber(confirmed.confirmedAltitude);
  return {
    ...position,
    altitude:
      Number.isFinite(altitude) && Number.isFinite(verticalRate)
        ? altitude + (verticalRate * ageSeconds) / 60
        : confirmed.confirmedAltitude,
    predictionAgeSeconds: ageSeconds,
    predictionGeneratedAt: displayTimestamp
  };
}
