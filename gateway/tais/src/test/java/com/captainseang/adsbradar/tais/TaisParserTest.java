package com.captainseang.adsbradar.tais;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class TaisParserTest {
    private static final String XML = """
        <?xml version="1.0" encoding="UTF-8"?>
        <ns2:TATrackAndFlightPlan xmlns:ns2="urn:us:gov:dot:faa:atm:terminal:entities:v4-0:tais:terminalautomationinformation">
          <src>P50</src>
          <record>
            <recSAFAReceiptTime>2026-08-21T21:42:48.995Z</recSAFAReceiptTime>
            <track>
              <trackNum>2887</trackNum><mrtTime>2026-08-21T21:42:48.552Z</mrtTime>
              <status>active</status><acAddress>a668f1</acAddress>
              <lat>33.52097</lat><lon>-111.94339</lon><vVert>-7</vVert>
              <vx>29</vx><vy>99</vy><adsb>1</adsb>
              <reportedBeaconCode>1200</reportedBeaconCode><reportedAltitude>3700</reportedAltitude>
            </track>
            <flightPlan><acid>N12345</acid><acType>P28A</acType><flightRules>V</flightRules></flightPlan>
            <enhancedData><sfdpsGufi>us.fdps.sample</sfdpsGufi><departureAirport>KSDL</departureAirport><destinationAirport>KCHD</destinationAirport></enhancedData>
          </record>
        </ns2:TATrackAndFlightPlan>
        """;

    @Test
    void parsesTrustedTrackAndFlightPlanFields() throws Exception {
        var observations = new TaisParser().parse(XML);
        assertEquals(1, observations.size());
        var track = observations.getFirst();
        assertEquals("P50", track.source());
        assertEquals("2887", track.trackNumber());
        assertEquals("a668f1", track.icao());
        assertEquals("N12345", track.callsign());
        assertEquals("1200", track.beaconCode());
        assertEquals(33.52097, track.latitude());
        assertEquals(-111.94339, track.longitude());
        assertEquals(3700, track.altitudeFeet());
        assertEquals(-7, track.verticalRateFeetPerMinute());
        assertEquals(Instant.parse("2026-08-21T21:42:48.552Z"), track.observationTime());
        assertEquals("P28A", track.aircraftType());
        assertEquals("V", track.flightRules());
        assertEquals("KSDL", track.departure());
        assertEquals("KCHD", track.destination());
        assertEquals(29, track.rawVx());
        assertEquals(99, track.rawVy());
        assertTrue(track.flightPlanCorrelated());
    }

    @Test
    void rejectsExternalEntityDeclarations() {
        String unsafe = "<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><TATrackAndFlightPlan><src>&y;</src></TATrackAndFlightPlan>";
        assertThrows(Exception.class, () -> new TaisParser().parse(unsafe));
    }
}
