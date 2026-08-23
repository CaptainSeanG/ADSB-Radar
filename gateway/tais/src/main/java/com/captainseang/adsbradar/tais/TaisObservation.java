package com.captainseang.adsbradar.tais;

import java.time.Instant;

record TaisObservation(
    String source,
    String trackNumber,
    String icao,
    String gufi,
    String callsign,
    String beaconCode,
    double latitude,
    double longitude,
    Integer altitudeFeet,
    Integer verticalRateFeetPerMinute,
    Boolean adsb,
    String status,
    Instant observationTime,
    Instant sourceMessageTime,
    String aircraftType,
    String flightRules,
    String departure,
    String destination,
    boolean flightPlanCorrelated,
    Double rawVx,
    Double rawVy
) {
    boolean hasPosition() {
        return Double.isFinite(latitude) && Double.isFinite(longitude)
            && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    boolean isDropped() {
        return "drop".equalsIgnoreCase(status);
    }
}
