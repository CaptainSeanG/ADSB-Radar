import XCTest
@testable import ADSBRadarGateway

final class ParserTests: XCTestCase {
    func testLaunchctlSnapshotTargetsExactService() {
        let output = """
        gui/501/com.captainseang.adsbradar.tais-gateway = {
            state = running
            pid = 24166
        }
        """
        let snapshot = LaunchctlParser.snapshot(from: output, installed: true)
        XCTAssertEqual(snapshot.level, .healthy)
        XCTAssertEqual(snapshot.pid, 24166)
        XCTAssertEqual(snapshot.state, "Running")
    }

    func testElapsedTimeParser() {
        XCTAssertEqual(LaunchctlParser.elapsedSeconds("01:02"), 62)
        XCTAssertEqual(LaunchctlParser.elapsedSeconds("02:03:04"), 7384)
        XCTAssertEqual(LaunchctlParser.elapsedSeconds("1-02:03:04"), 93784)
    }

    func testLegacyQuickTunnelLogParser() {
        let log = """
        {"time":"2026-08-22T20:38:54Z","message":"https://sample-words.trycloudflare.com"}
        {"time":"2026-08-22T20:38:54Z","message":"Registered tunnel connection"}
        """
        let telemetry = TunnelLogParser.telemetry(from: log)
        XCTAssertEqual(telemetry.mode, "Legacy Quick Tunnel")
        XCTAssertEqual(telemetry.publicURL, "https://sample-words.trycloudflare.com")
        XCTAssertNotNil(telemetry.connectedAt)
    }

    func testPermanentNamedTunnelWinsOverHistoricalQuickTunnelLog() {
        let log = """
        {"time":"2026-08-22T20:38:54Z","message":"https://sample-words.trycloudflare.com"}
        {"time":"2026-08-24T21:04:35Z","message":"Settings: map[credentials-file:/Users/example/.cloudflared/tunnel.json]"}
        {"time":"2026-08-24T21:04:38Z","message":"Registered tunnel connection"}
        """
        let telemetry = TunnelLogParser.telemetry(from: log)
        XCTAssertEqual(telemetry.mode, "Permanent Named Tunnel")
        XCTAssertEqual(telemetry.publicURL, "https://tais.adsbradar.net")
        XCTAssertNotNil(telemetry.connectedAt)
    }

    func testGatewayHealthDecoding() throws {
        let json = """
        {"ok":true,"gatewayVersion":"v1","startedAt":"2026-08-23T00:00:00Z","uptimeSeconds":60,"connectionState":"live","connected":true,"queueConnected":true,"lastMessageTimestamp":"2026-08-23T00:00:59Z","lastMessageAgeSeconds":1,"messagesPerSecond":3.2,"normalizedPositionUpdatesPerSecond":18.5,"activeTracks":92,"parseErrors":0,"reconnects":1}
        """
        let health = try JSONDecoder().decode(GatewayHealth.self, from: Data(json.utf8))
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.activeTracks, 92)
        XCTAssertEqual(health.queueConnected, true)
    }

    func testDashboardRefreshCadenceIsFifteenSeconds() {
        XCTAssertEqual(DashboardModel.localRefreshIntervalSeconds, 15)
        XCTAssertEqual(DashboardModel.workerRefreshIntervalSeconds, 60)
        XCTAssertEqual(DashboardModel.workerMetricsRefreshIntervalSeconds, 300)
        let now = Date()
        XCTAssertTrue(DashboardModel.workerRefreshIsDue(lastRefresh: nil, now: now))
        XCTAssertFalse(DashboardModel.workerRefreshIsDue(lastRefresh: now.addingTimeInterval(-59), now: now))
        XCTAssertTrue(DashboardModel.workerRefreshIsDue(lastRefresh: now.addingTimeInterval(-60), now: now))
        XCTAssertFalse(DashboardModel.workerMetricsRefreshIsDue(lastRefresh: now.addingTimeInterval(-299), now: now))
        XCTAssertTrue(DashboardModel.workerMetricsRefreshIsDue(lastRefresh: now.addingTimeInterval(-300), now: now))
    }

    func testCentralHealthEvaluatorHealthyState() {
        let result = HealthEvaluator.evaluate(
            gatewayService: runningService(),
            tunnelService: runningService(),
            gatewayHealth: gatewayHealth(messageAge: 2),
            tunnelTelemetry: connectedTunnel(),
            workerHealth: liveWorker(),
            consecutiveWorkerFailures: 0
        )
        XCTAssertEqual(result.level, .healthy)
        XCTAssertEqual(result.summary, "FAA TAIS live")
    }

    func testCentralHealthEvaluatorDegradesForStaleFAAData() {
        let result = HealthEvaluator.evaluate(
            gatewayService: runningService(),
            tunnelService: runningService(),
            gatewayHealth: gatewayHealth(messageAge: 45),
            tunnelTelemetry: connectedTunnel(),
            workerHealth: liveWorker(),
            consecutiveWorkerFailures: 0
        )
        XCTAssertEqual(result.level, .degraded)
    }

    func testCentralHealthEvaluatorFailsForStoppedGateway() {
        var gateway = runningService()
        gateway.pid = nil
        gateway.level = .failed
        let result = HealthEvaluator.evaluate(
            gatewayService: gateway,
            tunnelService: runningService(),
            gatewayHealth: gatewayHealth(messageAge: 2),
            tunnelTelemetry: connectedTunnel(),
            workerHealth: liveWorker(),
            consecutiveWorkerFailures: 0
        )
        XCTAssertEqual(result.level, .failed)
        XCTAssertEqual(result.summary, "TAIS gateway stopped")
    }

    func testCentralHealthEvaluatorUsesWorkerFailureGraceRefresh() {
        let degraded = HealthEvaluator.evaluate(
            gatewayService: runningService(),
            tunnelService: runningService(),
            gatewayHealth: gatewayHealth(messageAge: 2),
            tunnelTelemetry: connectedTunnel(),
            workerHealth: nil,
            consecutiveWorkerFailures: 1
        )
        let failed = HealthEvaluator.evaluate(
            gatewayService: runningService(),
            tunnelService: runningService(),
            gatewayHealth: gatewayHealth(messageAge: 2),
            tunnelTelemetry: connectedTunnel(),
            workerHealth: nil,
            consecutiveWorkerFailures: 2
        )
        XCTAssertEqual(degraded.level, .degraded)
        XCTAssertEqual(failed.level, .failed)
    }

    private func runningService() -> ServiceSnapshot {
        ServiceSnapshot(level: .healthy, state: "Running", pid: 123, detail: "", installed: true)
    }

    private func gatewayHealth(messageAge: Double) -> GatewayHealth {
        GatewayHealth(
            ok: true,
            gatewayVersion: "test",
            startedAt: nil,
            uptimeSeconds: 60,
            connectionState: "live",
            connected: true,
            queueConnected: true,
            lastMessageTimestamp: nil,
            lastMessageAgeSeconds: messageAge,
            messagesPerSecond: 2,
            normalizedPositionUpdatesPerSecond: 10,
            activeTracks: 50,
            parseErrors: 0,
            reconnects: 0
        )
    }

    private func connectedTunnel() -> TunnelTelemetry {
        TunnelTelemetry(
            mode: "Permanent Named Tunnel",
            publicURL: "https://tais.adsbradar.net",
            localTarget: "http://127.0.0.1:8788",
            connectedAt: Date(),
            latencyMilliseconds: 50
        )
    }

    private func liveWorker() -> WorkerHealth {
        WorkerHealth(
            ok: true,
            workerVersion: "test",
            taisGatewayConfigured: true,
            activeClientTelemetryConfigured: true,
            taisState: WorkerHealth.TaisState(selected: true, state: "live", lastAttemptAgeSeconds: 1, reason: "live")
        )
    }
}
