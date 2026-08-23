package com.captainseang.adsbradar.tais;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

record GatewayConfig(
    String providerUrl,
    String queue,
    String connectionFactory,
    String username,
    String password,
    String vpn,
    Path trustStore,
    String apiToken,
    int port,
    double coverageCenterLat,
    double coverageCenterLon,
    double coverageRadiusMiles
) {
    static GatewayConfig fromEnvironment() {
        Map<String, String> env = System.getenv();
        return new GatewayConfig(
            required(env, "FAA_TAIS_PROVIDER_URL"),
            required(env, "FAA_TAIS_QUEUE"),
            required(env, "FAA_TAIS_CONNECTION_FACTORY"),
            required(env, "FAA_TAIS_USERNAME"),
            secret(env, "FAA_TAIS_PASSWORD", "FAA_TAIS_PASSWORD_FILE"),
            env.getOrDefault("FAA_TAIS_VPN", "STDDS"),
            optionalPath(env.get("FAA_TAIS_TRUST_STORE")),
            secret(env, "TAIS_GATEWAY_TOKEN", "TAIS_GATEWAY_TOKEN_FILE"),
            integer(env.get("TAIS_GATEWAY_PORT"), 8788),
            decimal(env.get("TAIS_COVERAGE_CENTER_LAT"), 33.4342),
            decimal(env.get("TAIS_COVERAGE_CENTER_LON"), -112.0116),
            decimal(env.get("TAIS_COVERAGE_RADIUS_MILES"), 125)
        );
    }

    boolean covers(double latitude, double longitude) {
        return TrafficTable.miles(coverageCenterLat, coverageCenterLon, latitude, longitude) <= coverageRadiusMiles;
    }

    String redactedSummary() {
        return "provider=" + providerUrl + ", queue=<redacted .OUT>, user=<redacted>, vpn=" + vpn
            + ", port=" + port + ", coverage=" + coverageRadiusMiles + "mi around "
            + coverageCenterLat + "," + coverageCenterLon;
    }

    private static String required(Map<String, String> env, String name) {
        String value = env.get(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing required environment variable " + name);
        return value;
    }

    private static Path optionalPath(String value) {
        return value == null || value.isBlank() ? null : Path.of(value).toAbsolutePath();
    }

    private static String secret(Map<String, String> env, String valueName, String fileName) {
        String direct = env.get(valueName);
        if (direct != null && !direct.isBlank()) return direct;
        String path = env.get(fileName);
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("Missing required secret " + valueName + " or " + fileName);
        }
        try {
            String value = Files.readString(Path.of(path)).trim();
            if (value.isBlank()) throw new IllegalArgumentException("Secret file for " + valueName + " is empty");
            return value;
        } catch (Exception error) {
            throw new IllegalArgumentException("Unable to read secret file for " + valueName, error);
        }
    }

    private static int integer(String value, int fallback) {
        try {
            return value == null ? fallback : Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static double decimal(String value, double fallback) {
        try {
            return value == null ? fallback : Double.parseDouble(value);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}
