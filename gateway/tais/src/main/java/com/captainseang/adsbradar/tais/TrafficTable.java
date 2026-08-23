package com.captainseang.adsbradar.tais;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONObject;

final class TrafficTable {
    static final Duration TRACK_EXPIRY = Duration.ofSeconds(30);
    private static final Duration FALLBACK_REUSE_GAP = Duration.ofSeconds(30);
    private static final double FALLBACK_TELEPORT_MILES = 25;

    private final Map<String, ActiveTrack> tracks = new HashMap<>();
    private final Map<String, FallbackSlot> fallbackSlots = new HashMap<>();
    private final ArrayDeque<Long> updateIntervalsMillis = new ArrayDeque<>();
    private long acceptedObservations;
    private long repeatedObservations;
    private long lifecycleRotations;

    synchronized void accept(TaisObservation observation, Instant receivedAt) {
        if (observation == null || observation.observationTime() == null) return;
        String slotKey = slotKey(observation);
        FallbackSlot slot = fallbackSlots.computeIfAbsent(slotKey, ignored -> new FallbackSlot());

        if (observation.isDropped()) {
            if (slot.activeId != null) tracks.remove(slot.activeId);
            slot.generation++;
            slot.activeId = null;
            slot.lastObservation = observation;
            lifecycleRotations++;
            return;
        }
        if (!observation.hasPosition()) return;

        String naturalIdentity = naturalIdentity(observation);
        boolean rotate = shouldRotate(slot, observation);

        String stableId;
        if (!naturalIdentity.isBlank()) {
            stableId = naturalIdentity;
            if (slot.activeId != null && !slot.activeId.equals(stableId)) tracks.remove(slot.activeId);
        } else {
            if (slot.activeId == null || rotate) {
                if (slot.activeId != null) tracks.remove(slot.activeId);
                slot.generation++;
                lifecycleRotations++;
            }
            stableId = fallbackIdentity(observation, slot.generation);
        }
        slot.activeId = stableId;
        slot.lastObservation = observation;

        ActiveTrack current = tracks.get(stableId);
        if (current != null && !observation.observationTime().isAfter(current.observationTime)) {
            repeatedObservations++;
            return;
        }
        if (current != null) {
            long interval = Duration.between(current.observationTime, observation.observationTime()).toMillis();
            if (interval > 0 && interval <= 60000) {
                updateIntervalsMillis.addLast(interval);
                while (updateIntervalsMillis.size() > 20000) updateIntervalsMillis.removeFirst();
            }
        }
        tracks.put(stableId, ActiveTrack.merged(stableId, current, observation, receivedAt));
        acceptedObservations++;
    }

    synchronized Snapshot snapshot(Instant now, Double centerLat, Double centerLon, Double radiusMiles) {
        expire(now);
        List<ActiveTrack> visible = tracks.values().stream()
            .filter(track -> centerLat == null || centerLon == null || radiusMiles == null
                || miles(centerLat, centerLon, track.latitude, track.longitude) <= radiusMiles + 1)
            .sorted(Comparator.comparing(track -> track.stableId))
            .toList();
        Instant dataTimestamp = visible.stream()
            .map(track -> track.observationTime)
            .max(Comparator.naturalOrder())
            .orElse(null);
        String snapshotId = snapshotId(visible);
        return new Snapshot(
            visible,
            dataTimestamp,
            snapshotId,
            acceptedObservations,
            repeatedObservations,
            lifecycleRotations
        );
    }

    synchronized int activeCount(Instant now) {
        expire(now);
        return tracks.size();
    }

    synchronized long acceptedObservations() {
        return acceptedObservations;
    }

    synchronized long repeatedObservations() {
        return repeatedObservations;
    }

    synchronized long lifecycleRotations() {
        return lifecycleRotations;
    }

    synchronized UpdateIntervalStats updateIntervalStats() {
        if (updateIntervalsMillis.isEmpty()) return new UpdateIntervalStats(0, null, null);
        List<Long> sorted = updateIntervalsMillis.stream().sorted().toList();
        return new UpdateIntervalStats(
            sorted.size(),
            percentile(sorted, 0.50) / 1000.0,
            percentile(sorted, 0.95) / 1000.0
        );
    }

    private static long percentile(List<Long> sorted, double percentile) {
        int index = (int) Math.ceil(percentile * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, index)));
    }

    private void expire(Instant now) {
        tracks.entrySet().removeIf(entry -> Duration.between(entry.getValue().observationTime, now).compareTo(TRACK_EXPIRY) > 0);
        fallbackSlots.entrySet().removeIf(entry -> {
            TaisObservation last = entry.getValue().lastObservation;
            return last != null && last.observationTime() != null
                && Duration.between(last.observationTime(), now).compareTo(Duration.ofMinutes(10)) > 0;
        });
    }

    private static String naturalIdentity(TaisObservation observation) {
        if (!observation.icao().isBlank()) return observation.icao();
        if (!observation.gufi().isBlank()) return "tais-gufi-" + shortHash(observation.gufi());
        return "";
    }

    private static String fallbackIdentity(TaisObservation observation, long generation) {
        String source = safeToken(observation.source().isBlank() ? "unknown" : observation.source());
        String track = safeToken(observation.trackNumber().isBlank() ? "unknown" : observation.trackNumber());
        return "tais-" + source + "-" + track + "-g" + Math.max(1, generation);
    }

    private static String slotKey(TaisObservation observation) {
        return observation.source() + ":" + observation.trackNumber();
    }

    private static boolean shouldRotate(FallbackSlot slot, TaisObservation next) {
        TaisObservation previous = slot.lastObservation;
        if (previous == null || previous.observationTime() == null) return slot.activeId == null;
        Duration gap = Duration.between(previous.observationTime(), next.observationTime());
        if (gap.compareTo(FALLBACK_REUSE_GAP) > 0) return true;
        if (materiallyChanged(previous.beaconCode(), next.beaconCode())) return true;
        if (materiallyChanged(previous.callsign(), next.callsign())) return true;
        return !gap.isNegative() && gap.compareTo(Duration.ofSeconds(15)) <= 0
            && miles(previous.latitude(), previous.longitude(), next.latitude(), next.longitude()) > FALLBACK_TELEPORT_MILES;
    }

    private static boolean materiallyChanged(String previous, String next) {
        return previous != null && next != null && !previous.isBlank() && !next.isBlank() && !previous.equals(next);
    }

    private static String safeToken(String value) {
        return value.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private static String snapshotId(List<ActiveTrack> tracks) {
        StringBuilder input = new StringBuilder();
        for (ActiveTrack track : tracks) {
            input.append(track.stableId).append('|')
                .append(track.latitude).append('|').append(track.longitude).append('|')
                .append(track.altitudeFeet).append('|').append(track.observationTime.toEpochMilli()).append('\n');
        }
        return shortHash(input.toString());
    }

    private static String shortHash(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    static double miles(double latA, double lonA, double latB, double lonB) {
        double earthMiles = 3958.7613;
        double dLat = Math.toRadians(latB - latA);
        double dLon = Math.toRadians(lonB - lonA);
        double value = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(latA)) * Math.cos(Math.toRadians(latB))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * earthMiles * Math.asin(Math.sqrt(value));
    }

    record Snapshot(
        List<ActiveTrack> tracks,
        Instant dataTimestamp,
        String snapshotId,
        long acceptedObservations,
        long repeatedObservations,
        long lifecycleRotations
    ) {
        JSONArray aircraftJson(Instant now) {
            JSONArray array = new JSONArray();
            tracks.forEach(track -> array.put(track.toJson(now)));
            return array;
        }
    }

    record UpdateIntervalStats(int samples, Double medianSeconds, Double p95Seconds) {}

    static final class ActiveTrack {
        final String stableId;
        final String source;
        final String trackNumber;
        final String icao;
        final String gufi;
        final String callsign;
        final String beaconCode;
        final double latitude;
        final double longitude;
        final Integer altitudeFeet;
        final Integer verticalRateFeetPerMinute;
        final Boolean adsb;
        final String status;
        final Instant observationTime;
        final Instant sourceMessageTime;
        final Instant receivedAt;
        final String aircraftType;
        final String flightRules;
        final String departure;
        final String destination;
        final boolean flightPlanCorrelated;
        final Double rawVx;
        final Double rawVy;

        private ActiveTrack(
            String stableId, String source, String trackNumber, String icao, String gufi,
            String callsign, String beaconCode, double latitude, double longitude,
            Integer altitudeFeet, Integer verticalRateFeetPerMinute, Boolean adsb, String status,
            Instant observationTime, Instant sourceMessageTime, Instant receivedAt,
            String aircraftType, String flightRules, String departure, String destination,
            boolean flightPlanCorrelated, Double rawVx, Double rawVy
        ) {
            this.stableId = stableId;
            this.source = source;
            this.trackNumber = trackNumber;
            this.icao = icao;
            this.gufi = gufi;
            this.callsign = callsign;
            this.beaconCode = beaconCode;
            this.latitude = latitude;
            this.longitude = longitude;
            this.altitudeFeet = altitudeFeet;
            this.verticalRateFeetPerMinute = verticalRateFeetPerMinute;
            this.adsb = adsb;
            this.status = status;
            this.observationTime = observationTime;
            this.sourceMessageTime = sourceMessageTime;
            this.receivedAt = receivedAt;
            this.aircraftType = aircraftType;
            this.flightRules = flightRules;
            this.departure = departure;
            this.destination = destination;
            this.flightPlanCorrelated = flightPlanCorrelated;
            this.rawVx = rawVx;
            this.rawVy = rawVy;
        }

        static ActiveTrack merged(String stableId, ActiveTrack previous, TaisObservation next, Instant receivedAt) {
            return new ActiveTrack(
                stableId,
                next.source(),
                next.trackNumber(),
                prefer(next.icao(), previous == null ? "" : previous.icao),
                prefer(next.gufi(), previous == null ? "" : previous.gufi),
                prefer(next.callsign(), previous == null ? "" : previous.callsign),
                prefer(next.beaconCode(), previous == null ? "" : previous.beaconCode),
                next.latitude(),
                next.longitude(),
                next.altitudeFeet() != null ? next.altitudeFeet() : previous == null ? null : previous.altitudeFeet,
                next.verticalRateFeetPerMinute() != null ? next.verticalRateFeetPerMinute() : previous == null ? null : previous.verticalRateFeetPerMinute,
                next.adsb() != null ? next.adsb() : previous == null ? null : previous.adsb,
                prefer(next.status(), previous == null ? "" : previous.status),
                next.observationTime(),
                next.sourceMessageTime() != null ? next.sourceMessageTime() : previous == null ? null : previous.sourceMessageTime,
                receivedAt,
                prefer(next.aircraftType(), previous == null ? "" : previous.aircraftType),
                prefer(next.flightRules(), previous == null ? "" : previous.flightRules),
                prefer(next.departure(), previous == null ? "" : previous.departure),
                prefer(next.destination(), previous == null ? "" : previous.destination),
                next.flightPlanCorrelated() || previous != null && previous.flightPlanCorrelated,
                next.rawVx() != null ? next.rawVx() : previous == null ? null : previous.rawVx,
                next.rawVy() != null ? next.rawVy() : previous == null ? null : previous.rawVy
            );
        }

        JSONObject toJson(Instant now) {
            long ageSeconds = Math.max(0, Duration.between(observationTime, now).toSeconds());
            JSONObject object = new JSONObject()
                .put("hex", stableId)
                .put("icao", icao)
                .put("callsign", callsign)
                .put("nNumber", callsign.matches("(?i)^N[0-9A-Z]+$") ? callsign : "")
                .put("type", aircraftType)
                .put("sourceType", "faa-tais-p50")
                .put("lat", latitude)
                .put("lon", longitude)
                .put("altitude", altitudeFeet == null ? JSONObject.NULL : altitudeFeet)
                .put("speed", JSONObject.NULL)
                .put("track", JSONObject.NULL)
                .put("verticalRate", verticalRateFeetPerMinute == null ? JSONObject.NULL : verticalRateFeetPerMinute)
                .put("seen", ageSeconds)
                .put("seenPos", ageSeconds)
                .put("positionObservedAt", observationTime.toEpochMilli())
                .put("updatedAt", observationTime.toEpochMilli())
                .put("positionTimestampTrusted", true)
                .put("positionTimestampSource", "faa-tais-mrtTime")
                .put("sourceMessageTimestamp", sourceMessageTime == null ? JSONObject.NULL : sourceMessageTime.toEpochMilli())
                .put("sourcePositionAgeSeconds", ageSeconds)
                .put("gatewayReceivedAt", receivedAt.toEpochMilli())
                .put("beaconCode", beaconCode)
                .put("adsb", adsb == null ? JSONObject.NULL : adsb)
                .put("trackStatus", status)
                .put("faaTrackNumber", trackNumber)
                .put("sourceFacility", source)
                .put("flightPlanCorrelated", flightPlanCorrelated)
                .put("flightRules", flightRules)
                .put("departure", departure)
                .put("destination", destination);
            return object;
        }

        private static String prefer(String value, String fallback) {
            return value == null || value.isBlank() ? Objects.requireNonNullElse(fallback, "") : value;
        }
    }

    private static final class FallbackSlot {
        long generation;
        String activeId;
        TaisObservation lastObservation;
    }
}
