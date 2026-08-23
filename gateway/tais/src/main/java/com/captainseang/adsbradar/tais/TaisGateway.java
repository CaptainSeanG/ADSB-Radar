package com.captainseang.adsbradar.tais;

import com.solacesystems.jms.SupportedProperty;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import javax.jms.BytesMessage;
import javax.jms.Connection;
import javax.jms.ConnectionFactory;
import javax.jms.Message;
import javax.jms.MessageConsumer;
import javax.jms.Session;
import javax.jms.TextMessage;
import javax.naming.Context;
import javax.naming.InitialContext;
import org.json.JSONObject;

public final class TaisGateway implements AutoCloseable {
    static final String VERSION = "2026-08-21-p50-tais-gateway-v1";
    private static final Duration LIVE_MESSAGE_AGE = Duration.ofSeconds(10);

    private final GatewayConfig config;
    private final TrafficTable traffic = new TrafficTable();
    private final TaisParser parser = new TaisParser();
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final AtomicReference<String> connectionState = new AtomicReference<>("connecting");
    private final AtomicReference<Instant> lastMessageAt = new AtomicReference<>();
    private final AtomicLong messages = new AtomicLong();
    private final AtomicLong positionUpdates = new AtomicLong();
    private final AtomicLong parseErrors = new AtomicLong();
    private final AtomicLong reconnects = new AtomicLong();
    private final ArrayDeque<Long> recentMessageTimes = new ArrayDeque<>();
    private final ArrayDeque<RateSample> recentPositionSamples = new ArrayDeque<>();
    private volatile Connection connection;
    private HttpServer httpServer;

    private TaisGateway(GatewayConfig config) {
        this.config = config;
    }

    public static void main(String[] args) throws Exception {
        GatewayConfig config = GatewayConfig.fromEnvironment();
        TaisGateway gateway = new TaisGateway(config);
        Runtime.getRuntime().addShutdownHook(new Thread(gateway::close, "tais-gateway-shutdown"));
        gateway.start();
        System.out.println("FAA TAIS gateway started: " + config.redactedSummary());
        while (gateway.running.get()) Thread.sleep(1000);
    }

    private void start() throws IOException {
        startHttpServer();
        Thread.ofPlatform().name("tais-jms-connection").daemon(true).start(this::connectionLoop);
    }

    private void startHttpServer() throws IOException {
        httpServer = HttpServer.create(new InetSocketAddress("127.0.0.1", config.port()), 0);
        httpServer.createContext("/health", this::handleHealth);
        httpServer.createContext("/api/aircraft", this::handleAircraft);
        httpServer.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        httpServer.start();
    }

    private void connectionLoop() {
        long backoffMillis = 1000;
        boolean connectedBefore = false;
        while (running.get()) {
            CountDownLatch disconnected = new CountDownLatch(1);
            try {
                connectionState.set(connectedBefore ? "reconnecting" : "connecting");
                Connection nextConnection = createConnection();
                nextConnection.setExceptionListener(error -> {
                    connected.set(false);
                    connectionState.set("unavailable");
                    disconnected.countDown();
                });
                Session session = nextConnection.createSession(false, Session.AUTO_ACKNOWLEDGE);
                javax.jms.Queue queue = lookupQueue();
                MessageConsumer consumer = session.createConsumer(queue);
                consumer.setMessageListener(this::onMessage);
                connection = nextConnection;
                nextConnection.start();
                connected.set(true);
                connectionState.set("live");
                if (connectedBefore) reconnects.incrementAndGet();
                connectedBefore = true;
                backoffMillis = 1000;
                disconnected.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception error) {
                connected.set(false);
                connectionState.set("unavailable");
                System.err.println("FAA TAIS connection unavailable: " + safeError(error));
            } finally {
                closeConnection();
            }

            if (!running.get()) break;
            try {
                Thread.sleep(backoffMillis);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
            backoffMillis = Math.min(30000, backoffMillis * 2);
        }
    }

    private Connection createConnection() throws Exception {
        InitialContext context = initialContext();
        ConnectionFactory factory = (ConnectionFactory) context.lookup(config.connectionFactory());
        return factory.createConnection();
    }

    private javax.jms.Queue lookupQueue() throws Exception {
        InitialContext context = initialContext();
        return (javax.jms.Queue) context.lookup(config.queue());
    }

    private InitialContext initialContext() throws Exception {
        Hashtable<String, Object> environment = new Hashtable<>();
        environment.put(Context.INITIAL_CONTEXT_FACTORY, "com.solacesystems.jndi.SolJNDIInitialContextFactory");
        environment.put(Context.PROVIDER_URL, config.providerUrl());
        environment.put(Context.SECURITY_PRINCIPAL, config.username());
        environment.put(Context.SECURITY_CREDENTIALS, config.password());
        environment.put(SupportedProperty.SOLACE_JMS_SSL_VALIDATE_CERTIFICATE, true);
        environment.put(SupportedProperty.SOLACE_JMS_VPN, config.vpn());
        environment.put(SupportedProperty.SOLACE_JMS_JNDI_CONNECT_RETRIES, 0);
        if (config.trustStore() != null) {
            environment.put(SupportedProperty.SOLACE_JMS_SSL_TRUST_STORE, config.trustStore().toUri().toString());
        }
        return new InitialContext(environment);
    }

    private void onMessage(Message message) {
        try {
            String xml = messageBody(message);
            Instant receivedAt = Instant.now();
            var observations = parser.parse(xml);
            observations.forEach(observation -> traffic.accept(observation, receivedAt));
            messages.incrementAndGet();
            positionUpdates.addAndGet(observations.size());
            lastMessageAt.set(receivedAt);
            recordMessageTime(receivedAt.toEpochMilli());
            recordPositionSample(receivedAt.toEpochMilli(), observations.size());
            connectionState.set("live");
        } catch (Exception error) {
            parseErrors.incrementAndGet();
            System.err.println("FAA TAIS message rejected: " + safeError(error));
        }
    }

    private static String messageBody(Message message) throws Exception {
        if (message instanceof TextMessage text) return text.getText();
        if (message instanceof BytesMessage bytes) {
            bytes.reset();
            ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(Integer.MAX_VALUE, bytes.getBodyLength()));
            byte[] buffer = new byte[8192];
            int count;
            while ((count = bytes.readBytes(buffer)) > 0) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8);
        }
        throw new IllegalArgumentException("Unsupported JMS message class " + message.getClass().getSimpleName());
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) return;
        Instant now = Instant.now();
        JSONObject response = healthJson(now)
            .put("coverage", new JSONObject()
                .put("sourceFacility", "P50")
                .put("centerLat", config.coverageCenterLat())
                .put("centerLon", config.coverageCenterLon())
                .put("radiusMiles", config.coverageRadiusMiles()));
        sendJson(exchange, 200, response);
    }

    private void handleAircraft(HttpExchange exchange) throws IOException {
        if (!authorized(exchange)) return;
        Map<String, String> query = query(exchange.getRequestURI());
        Double latitude = decimal(query.get("lat"));
        Double longitude = decimal(query.get("lon"));
        Double radiusMiles = decimal(query.get("radiusMiles"));
        if (latitude == null || longitude == null || radiusMiles == null) {
            sendJson(exchange, 400, new JSONObject().put("error", "lat, lon, and radiusMiles are required"));
            return;
        }
        if (!config.covers(latitude, longitude)) {
            sendJson(exchange, 404, new JSONObject()
                .put("error", "Requested center is outside configured P50 beta coverage")
                .put("coverageEligible", false)
                .put("gatewayVersion", VERSION));
            return;
        }

        Instant now = Instant.now();
        TrafficTable.Snapshot snapshot = traffic.snapshot(now, latitude, longitude, Math.max(1, Math.min(250, radiusMiles)));
        String state = sourceState(now);
        boolean live = "live".equals(state);
        long dataAgeSeconds = snapshot.dataTimestamp() == null
            ? Long.MAX_VALUE
            : Math.max(0, Duration.between(snapshot.dataTimestamp(), now).toSeconds());
        JSONObject response = new JSONObject()
            .put("source", "FAA TAIS")
            .put("displaySource", "FAA TAIS")
            .put("provider", "faa-tais-p50")
            .put("sourceFacility", "P50")
            .put("coverageEligible", true)
            .put("receiverState", state)
            .put("stale", !live)
            .put("aircraft", snapshot.aircraftJson(now))
            .put("total", snapshot.tracks().size())
            .put("dataTimestamp", snapshot.dataTimestamp() == null ? JSONObject.NULL : snapshot.dataTimestamp().toString())
            .put("dataAgeSeconds", dataAgeSeconds == Long.MAX_VALUE ? JSONObject.NULL : dataAgeSeconds)
            .put("upstreamSnapshotId", snapshot.snapshotId())
            .put("upstreamSnapshotHash", snapshot.snapshotId())
            .put("snapshotCreatedAt", snapshot.dataTimestamp() == null ? JSONObject.NULL : snapshot.dataTimestamp().toString())
            .put("workerRetrievedAt", now.toEpochMilli())
            .put("gatewayVersion", VERSION)
            .put("gateway", healthJson(now));
        sendJson(exchange, live ? 200 : 503, response);
    }

    private JSONObject healthJson(Instant now) {
        Instant last = lastMessageAt.get();
        TrafficTable.UpdateIntervalStats intervals = traffic.updateIntervalStats();
        return new JSONObject()
            .put("ok", "live".equals(sourceState(now)))
            .put("gatewayVersion", VERSION)
            .put("connectionState", sourceState(now))
            .put("connected", connected.get())
            .put("lastMessageAgeSeconds", last == null ? JSONObject.NULL : Math.max(0, Duration.between(last, now).toMillis() / 1000.0))
            .put("messagesPerSecond", messagesPerSecond(now.toEpochMilli()))
            .put("normalizedPositionUpdatesPerSecond", positionUpdatesPerSecond(now.toEpochMilli()))
            .put("messages", messages.get())
            .put("positionUpdates", positionUpdates.get())
            .put("activeTracks", traffic.activeCount(now))
            .put("acceptedObservations", traffic.acceptedObservations())
            .put("repeatedObservations", traffic.repeatedObservations())
            .put("lifecycleRotations", traffic.lifecycleRotations())
            .put("updateIntervalSamples", intervals.samples())
            .put("medianTrackUpdateIntervalSeconds", intervals.medianSeconds() == null ? JSONObject.NULL : intervals.medianSeconds())
            .put("p95TrackUpdateIntervalSeconds", intervals.p95Seconds() == null ? JSONObject.NULL : intervals.p95Seconds())
            .put("parseErrors", parseErrors.get())
            .put("reconnects", reconnects.get())
            .put("timestamp", now.toString());
    }

    private String sourceState(Instant now) {
        Instant last = lastMessageAt.get();
        if (connected.get() && last != null && Duration.between(last, now).compareTo(LIVE_MESSAGE_AGE) <= 0) return "live";
        if (connected.get()) return last == null ? "connecting" : "stale";
        return connectionState.get();
    }

    private boolean authorized(HttpExchange exchange) throws IOException {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        String supplied = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : "";
        if (!MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8), config.apiToken().getBytes(StandardCharsets.UTF_8))) {
            sendJson(exchange, 401, new JSONObject().put("error", "Unauthorized"));
            return false;
        }
        return true;
    }

    private synchronized void recordMessageTime(long timestamp) {
        recentMessageTimes.addLast(timestamp);
        while (!recentMessageTimes.isEmpty() && timestamp - recentMessageTimes.peekFirst() > 60000) recentMessageTimes.removeFirst();
    }

    private synchronized double messagesPerSecond(long now) {
        while (!recentMessageTimes.isEmpty() && now - recentMessageTimes.peekFirst() > 60000) recentMessageTimes.removeFirst();
        if (recentMessageTimes.size() < 2) return 0;
        long span = Math.max(1000, recentMessageTimes.peekLast() - recentMessageTimes.peekFirst());
        return (recentMessageTimes.size() - 1) / (span / 1000.0);
    }

    private synchronized void recordPositionSample(long timestamp, int count) {
        recentPositionSamples.addLast(new RateSample(timestamp, count));
        while (!recentPositionSamples.isEmpty() && timestamp - recentPositionSamples.peekFirst().timestamp() > 60000) {
            recentPositionSamples.removeFirst();
        }
    }

    private synchronized double positionUpdatesPerSecond(long now) {
        while (!recentPositionSamples.isEmpty() && now - recentPositionSamples.peekFirst().timestamp() > 60000) {
            recentPositionSamples.removeFirst();
        }
        if (recentPositionSamples.isEmpty()) return 0;
        long count = recentPositionSamples.stream().mapToLong(RateSample::count).sum();
        long span = Math.max(1000, now - recentPositionSamples.peekFirst().timestamp());
        return count / (span / 1000.0);
    }

    private record RateSample(long timestamp, int count) {}

    private static Map<String, String> query(URI uri) {
        Map<String, String> values = new HashMap<>();
        if (uri.getRawQuery() == null) return values;
        for (String part : uri.getRawQuery().split("&")) {
            String[] pieces = part.split("=", 2);
            values.put(
                URLDecoder.decode(pieces[0], StandardCharsets.UTF_8),
                pieces.length > 1 ? URLDecoder.decode(pieces[1], StandardCharsets.UTF_8) : ""
            );
        }
        return values;
    }

    private static Double decimal(String value) {
        try {
            return value == null ? null : Double.valueOf(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static void sendJson(HttpExchange exchange, int status, JSONObject body) throws IOException {
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, data.length);
        exchange.getResponseBody().write(data);
        exchange.close();
    }

    private static String safeError(Throwable error) {
        String message = error == null ? "unknown" : error.getMessage();
        if (message == null || message.isBlank()) return error.getClass().getSimpleName();
        return message.replaceAll("(?i)(password|credential|token)=[^, ]+", "$1=<redacted>");
    }

    private void closeConnection() {
        Connection active = connection;
        connection = null;
        if (active != null) {
            try {
                active.close();
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void close() {
        if (!running.compareAndSet(true, false)) return;
        connected.set(false);
        closeConnection();
        if (httpServer != null) httpServer.stop(1);
    }
}
