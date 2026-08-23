package com.captainseang.adsbradar.tais;

import java.io.StringReader;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

final class TaisParser {
    private final DocumentBuilderFactory factory;

    TaisParser() {
        factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setExpandEntityReferences(false);
        try {
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        } catch (Exception error) {
            throw new IllegalStateException("Unable to secure TAIS XML parser", error);
        }
    }

    List<TaisObservation> parse(String xml) throws Exception {
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.parse(new InputSource(new StringReader(xml)));
        Element root = document.getDocumentElement();
        if (!"TATrackAndFlightPlan".equals(localName(root))) {
            throw new IllegalArgumentException("Unsupported TAIS root: " + localName(root));
        }

        String source = directText(root, "src");
        List<TaisObservation> observations = new ArrayList<>();
        for (Element record : directChildren(root, "record")) {
            Element track = directChild(record, "track");
            if (track == null) continue;
            Element flightPlan = directChild(record, "flightPlan");
            Element enhanced = directChild(record, "enhancedData");
            Double latitude = decimal(directText(track, "lat"));
            Double longitude = decimal(directText(track, "lon"));
            String status = directText(track, "status");
            boolean dropped = "drop".equalsIgnoreCase(status);
            if (!dropped && (latitude == null || longitude == null)) continue;

            String sfdpsGufi = directText(enhanced, "sfdpsGufi");
            String eramGufi = directText(enhanced, "eramGufi");
            observations.add(new TaisObservation(
                source,
                directText(track, "trackNum"),
                normalizeIcao(directText(track, "acAddress")),
                !sfdpsGufi.isBlank() ? sfdpsGufi : eramGufi,
                directText(flightPlan, "acid"),
                directText(track, "reportedBeaconCode"),
                latitude == null ? Double.NaN : latitude,
                longitude == null ? Double.NaN : longitude,
                integer(directText(track, "reportedAltitude")),
                integer(directText(track, "vVert")),
                booleanFlag(directText(track, "adsb")),
                status,
                instant(directText(track, "mrtTime")),
                instant(directText(record, "recSAFAReceiptTime")),
                directText(flightPlan, "acType"),
                directText(flightPlan, "flightRules"),
                directText(enhanced, "departureAirport"),
                directText(enhanced, "destinationAirport"),
                flightPlan != null,
                decimal(directText(track, "vx")),
                decimal(directText(track, "vy"))
            ));
        }
        return observations;
    }

    private static String normalizeIcao(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        return normalized.matches("[0-9a-f]{6}") && !"000000".equals(normalized) ? normalized : "";
    }

    private static Instant instant(String value) {
        try {
            return value == null || value.isBlank() ? null : Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static Integer integer(String value) {
        try {
            return value == null || value.isBlank() ? null : Integer.valueOf(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Double decimal(String value) {
        try {
            return value == null || value.isBlank() ? null : Double.valueOf(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Boolean booleanFlag(String value) {
        if ("1".equals(value) || "true".equalsIgnoreCase(value)) return true;
        if ("0".equals(value) || "false".equalsIgnoreCase(value)) return false;
        return null;
    }

    private static String directText(Element parent, String name) {
        Element child = directChild(parent, name);
        return child == null ? "" : child.getTextContent().trim();
    }

    private static Element directChild(Element parent, String name) {
        if (parent == null) return null;
        NodeList children = parent.getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node node = children.item(index);
            if (node instanceof Element element && name.equals(localName(element))) return element;
        }
        return null;
    }

    private static List<Element> directChildren(Element parent, String name) {
        List<Element> matches = new ArrayList<>();
        NodeList children = parent.getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node node = children.item(index);
            if (node instanceof Element element && name.equals(localName(element))) matches.add(element);
        }
        return matches;
    }

    private static String localName(Element element) {
        return element.getLocalName() == null ? element.getTagName() : element.getLocalName();
    }
}
