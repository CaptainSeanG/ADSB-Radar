package com.captainseang.adsbradar.tais;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class TrafficTableTest {
    private static final Instant START = Instant.parse("2026-08-21T21:42:48Z");

    @Test
    void repeatedObservationDoesNotBecomeFresh() {
        TrafficTable table = new TrafficTable();
        TaisObservation observation = observation("a668f1", "2887", "1200", START, 33.52, -111.94);
        table.accept(observation, START.plusMillis(400));
        String firstSnapshot = table.snapshot(START.plusSeconds(1), null, null, null).snapshotId();
        table.accept(observation, START.plusSeconds(4));
        var second = table.snapshot(START.plusSeconds(5), null, null, null);
        assertEquals(firstSnapshot, second.snapshotId());
        assertEquals(1, second.acceptedObservations());
        assertEquals(1, second.repeatedObservations());
        assertEquals(START.toEpochMilli(), second.tracks().getFirst().observationTime.toEpochMilli());
    }

    @Test
    void recycledTerminalTrackGetsNewGeneration() {
        TrafficTable table = new TrafficTable();
        table.accept(observation("", "77", "1200", START, 33.4, -112.0), START);
        String firstId = table.snapshot(START.plusSeconds(1), null, null, null).tracks().getFirst().stableId;
        table.accept(observation("", "77", "4312", START.plusSeconds(4), 33.41, -112.01), START.plusSeconds(4));
        var snapshot = table.snapshot(START.plusSeconds(5), null, null, null);
        assertEquals(1, snapshot.tracks().size());
        assertNotEquals(firstId, snapshot.tracks().getFirst().stableId);
        assertTrue(snapshot.tracks().getFirst().stableId.endsWith("g2"));
    }

    @Test
    void icaoIdentitySurvivesTerminalTrackChange() {
        TrafficTable table = new TrafficTable();
        table.accept(observation("a668f1", "77", "1200", START, 33.4, -112.0), START);
        table.accept(observation("a668f1", "91", "1200", START.plusSeconds(4), 33.41, -112.01), START.plusSeconds(4));
        var snapshot = table.snapshot(START.plusSeconds(5), null, null, null);
        assertEquals(1, snapshot.tracks().size());
        assertEquals("a668f1", snapshot.tracks().getFirst().stableId);
        assertEquals(START.plusSeconds(4), snapshot.tracks().getFirst().observationTime);
    }

    @Test
    void staleTrackExpiresWithoutReceiptTimeRefresh() {
        TrafficTable table = new TrafficTable();
        table.accept(observation("a668f1", "77", "1200", START, 33.4, -112.0), START.plusSeconds(20));
        assertEquals(0, table.snapshot(START.plusSeconds(31), null, null, null).tracks().size());
    }

    @Test
    void measuresPerTrackUpdateCadence() {
        TrafficTable table = new TrafficTable();
        table.accept(observation("a668f1", "77", "1200", START, 33.4, -112.0), START);
        table.accept(observation("a668f1", "77", "1200", START.plusSeconds(4), 33.41, -112.01), START.plusSeconds(4));
        table.accept(observation("a668f1", "77", "1200", START.plusSeconds(10), 33.42, -112.02), START.plusSeconds(10));
        var stats = table.updateIntervalStats();
        assertEquals(2, stats.samples());
        assertEquals(4.0, stats.medianSeconds());
        assertEquals(6.0, stats.p95Seconds());
    }

    @Test
    void explicitDropRemovesTrackWithoutPosition() {
        TrafficTable table = new TrafficTable();
        table.accept(observation("", "77", "1200", START, 33.4, -112.0), START);
        TaisObservation drop = new TaisObservation(
            "P50", "77", "", "", "", "1200", Double.NaN, Double.NaN, null, null,
            null, "drop", START.plusSeconds(2), START.plusSeconds(2), "", "", "", "",
            false, null, null
        );
        table.accept(drop, START.plusSeconds(2));
        assertEquals(0, table.snapshot(START.plusSeconds(3), null, null, null).tracks().size());
    }

    private static TaisObservation observation(
        String icao, String trackNumber, String beacon, Instant observedAt, double lat, double lon
    ) {
        return new TaisObservation(
            "P50", trackNumber, icao, "", "", beacon, lat, lon, 4500, 0,
            true, "active", observedAt, observedAt.plusMillis(300), "", "", "", "",
            false, 10.0, 20.0
        );
    }
}
