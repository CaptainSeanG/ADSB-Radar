import AppKit
import Combine
import Foundation

@MainActor
final class DashboardModel: ObservableObject {
    @Published var gatewayService = ServiceSnapshot()
    @Published var tunnelService = ServiceSnapshot()
    @Published var gatewayHealth: GatewayHealth?
    @Published var workerHealth: WorkerHealth?
    @Published var userMetrics: UserMetrics?
    @Published var tunnelTelemetry = TunnelTelemetry()
    @Published var gatewayAtLogin = true
    @Published var tunnelAtLogin = true
    @Published var events: [OperationalEvent] = []
    @Published var message = ""
    @Published var refreshing = false
    @Published private(set) var systemHealth = SystemHealth.starting
    @Published private(set) var lastRefreshedAt: Date?

    nonisolated static let localRefreshIntervalSeconds: TimeInterval = 15
    nonisolated static let workerRefreshIntervalSeconds: TimeInterval = 60
    nonisolated static let workerMetricsRefreshIntervalSeconds: TimeInterval = 300
    let manager = LaunchAgentManager()
    private let workerBaseURL = URL(string: "https://adsb-radar-proxy.macgyver2.workers.dev")!
    private var refreshTask: Task<Void, Never>?
    private var previousGatewayLevel: HealthLevel?
    private var previousTunnelLevel: HealthLevel?
    private var previousFAAState: String?
    private var previousWorkerLevel: HealthLevel?
    private var previousSystemLevel: HealthLevel?
    private var consecutiveWorkerFailures = 0
    private var lastWorkerRefreshAt: Date?
    private var lastWorkerMetricsRefreshAt: Date?

    var aggregateLevel: HealthLevel {
        systemHealth.level
    }

    var gatewayTelemetryConfigured: Bool { KeychainStore.string(account: "tais-gateway-token") != nil }
    var adminTelemetryConfigured: Bool { KeychainStore.string(account: "worker-admin-token") != nil }
    var usesPermanentNamedTunnel: Bool { tunnelTelemetry.mode == "Permanent Named Tunnel" }
    var combinedControlsEnabled: Bool {
        gatewayService.installed && tunnelService.installed && usesPermanentNamedTunnel
    }

    func startMonitoring() {
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(Self.localRefreshIntervalSeconds))
            }
        }
    }

    func stopMonitoring() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    func refresh(forceWorker: Bool = false) async {
        guard !refreshing else { return }
        refreshing = true
        let manager = manager
        let serviceState = await Task.detached {
            (
                manager.snapshot(.gateway),
                manager.snapshot(.tunnel),
                Self.readTunnelLog(manager: manager)
            )
        }.value
        gatewayService = serviceState.0
        tunnelService = serviceState.1
        tunnelTelemetry = serviceState.2
        gatewayAtLogin = manager.runAtLogin(.gateway)
        tunnelAtLogin = manager.runAtLogin(.tunnel)

        let refreshStartedAt = Date()
        let localResult = await fetchGatewayHealth(publicURL: tunnelTelemetry.publicURL)
        gatewayHealth = localResult.health
        if let latency = localResult.tunnelLatency { tunnelTelemetry.latencyMilliseconds = latency }

        if forceWorker || Self.workerRefreshIsDue(lastRefresh: lastWorkerRefreshAt, now: refreshStartedAt) {
            let publicWorker = await fetchWorkerHealth()
            workerHealth = publicWorker
            consecutiveWorkerFailures = publicWorker == nil ? consecutiveWorkerFailures + 1 : 0
            lastWorkerRefreshAt = Date()
        }
        if adminTelemetryConfigured && Self.workerMetricsRefreshIsDue(lastRefresh: lastWorkerMetricsRefreshAt, now: refreshStartedAt) {
            userMetrics = await fetchUserMetrics()
            lastWorkerMetricsRefreshAt = Date()
        }
        applyHealthLevels()
        systemHealth = HealthEvaluator.evaluate(
            gatewayService: gatewayService,
            tunnelService: tunnelService,
            gatewayHealth: gatewayHealth,
            tunnelTelemetry: tunnelTelemetry,
            workerHealth: workerHealth,
            consecutiveWorkerFailures: consecutiveWorkerFailures
        )
        recordTransitions()
        lastRefreshedAt = Date()
        refreshing = false
    }

    func installControls() {
        perform("Service definitions installed") {
            try self.manager.installDefinitions()
        }
    }

    func start(_ kind: ServiceKind) {
        perform("\(kind.rawValue.capitalized) start requested") { try self.manager.start(kind) }
    }

    func stop(_ kind: ServiceKind) {
        perform("\(kind.rawValue.capitalized) stopped") { try self.manager.stop(kind) }
    }

    func restart(_ kind: ServiceKind) {
        perform("\(kind.rawValue.capitalized) restart requested") { try self.manager.restart(kind) }
    }

    func startAll() {
        perform("All services start requested") {
            try self.manager.start(.gateway)
            try self.manager.start(.tunnel)
        }
    }

    func stopAll() {
        perform("All services stopped") {
            try self.manager.stop(.tunnel)
            try self.manager.stop(.gateway)
        }
    }

    func restartAll() {
        perform("All services restart requested") {
            try self.manager.restart(.gateway)
            try self.manager.restart(.tunnel)
        }
    }

    func setRunAtLogin(_ enabled: Bool, kind: ServiceKind) {
        perform("\(kind.rawValue.capitalized) login setting updated") {
            try self.manager.setRunAtLogin(enabled, for: kind)
        }
    }

    func revealLogs() {
        try? FileManager.default.createDirectory(at: manager.supportDirectory, withIntermediateDirectories: true)
        NSWorkspace.shared.activateFileViewerSelecting([manager.supportDirectory])
    }

    private func perform(_ successMessage: String, operation: @escaping () throws -> Void) {
        Task {
            do {
                try operation()
                message = successMessage
                events.insert(OperationalEvent(timestamp: Date(), message: successMessage, level: .healthy), at: 0)
            } catch {
                message = error.localizedDescription
                events.insert(OperationalEvent(timestamp: Date(), message: error.localizedDescription, level: .failed), at: 0)
            }
            events = Array(events.prefix(30))
            await refresh(forceWorker: true)
        }
    }

    nonisolated static func workerRefreshIsDue(lastRefresh: Date?, now: Date) -> Bool {
        guard let lastRefresh else { return true }
        return now.timeIntervalSince(lastRefresh) >= workerRefreshIntervalSeconds
    }

    nonisolated static func workerMetricsRefreshIsDue(lastRefresh: Date?, now: Date) -> Bool {
        guard let lastRefresh else { return true }
        return now.timeIntervalSince(lastRefresh) >= workerMetricsRefreshIntervalSeconds
    }

    private func fetchGatewayHealth(publicURL: String?) async -> (health: GatewayHealth?, tunnelLatency: Double?) {
        guard let token = KeychainStore.string(account: "tais-gateway-token") else { return (nil, nil) }
        let local = await request(url: URL(string: "http://127.0.0.1:8788/health")!, token: token, as: GatewayHealth.self)
        var latency: Double?
        if let publicURL, let url = URL(string: "\(publicURL)/health") {
            let started = Date()
            if let _ = await request(url: url, token: token, as: GatewayHealth.self) {
                latency = Date().timeIntervalSince(started) * 1000
            }
        }
        return (local, latency)
    }

    private func fetchWorkerHealth() async -> WorkerHealth? {
        await request(url: workerBaseURL.appendingPathComponent("health"), token: nil, as: WorkerHealth.self)
    }

    private func fetchUserMetrics() async -> UserMetrics? {
        guard let token = KeychainStore.string(account: "worker-admin-token") else { return nil }
        return await request(url: workerBaseURL.appendingPathComponent("admin/metrics"), token: token, as: UserMetrics.self)
    }

    private func request<T: Decodable>(url: URL, token: String?, as type: T.Type) async -> T? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    private func applyHealthLevels() {
        if let health = gatewayHealth {
            gatewayService.level = health.ok ? .healthy : .degraded
            gatewayService.state = health.ok ? "Live" : health.connectionState.capitalized
            gatewayService.detail = health.ok ? "FAA P50 queue receiving" : "FAA connection \(health.connectionState)"
        } else if gatewayService.pid != nil {
            gatewayService.level = .degraded
            gatewayService.state = gatewayTelemetryConfigured ? "Health Unavailable" : "Token Needed"
        }
        if tunnelService.pid != nil {
            tunnelService.level = tunnelTelemetry.connectedAt == nil ? .degraded : .healthy
            tunnelService.state = tunnelTelemetry.connectedAt == nil ? "Connecting" : "Connected"
            tunnelService.detail = tunnelTelemetry.mode
        }
    }

    private func recordTransitions() {
        recordTransition(previous: &previousGatewayLevel, current: gatewayService.level, healthy: "TAIS gateway running", unhealthy: "TAIS gateway unavailable")
        recordTransition(previous: &previousTunnelLevel, current: tunnelService.level, healthy: "Cloudflare tunnel connected", unhealthy: "Cloudflare tunnel unavailable")
        let workerLevel: HealthLevel = workerHealth?.ok == true ? .healthy : .degraded
        recordTransition(previous: &previousWorkerLevel, current: workerLevel, healthy: "Worker reachable", unhealthy: "Worker unavailable")
        if let faa = gatewayHealth?.connectionState, faa != previousFAAState {
            events.insert(OperationalEvent(timestamp: Date(), message: "FAA \(faa)", level: faa == "live" ? .healthy : .degraded), at: 0)
            previousFAAState = faa
        }
        recordTransition(
            previous: &previousSystemLevel,
            current: systemHealth.level,
            healthy: "All gateway systems healthy",
            unhealthy: systemHealth.summary
        )
        events = Array(events.prefix(30))
    }

    private func recordTransition(previous: inout HealthLevel?, current: HealthLevel, healthy: String, unhealthy: String) {
        guard previous != current else { return }
        previous = current
        events.insert(OperationalEvent(timestamp: Date(), message: current == .healthy ? healthy : unhealthy, level: current), at: 0)
    }

    nonisolated private static func readTunnelLog(manager: LaunchAgentManager) -> TunnelTelemetry {
        let candidates = [manager.tunnelLog, URL(fileURLWithPath: "/private/tmp/adsb-radar-tais-tunnel.log")]
        for url in candidates where FileManager.default.fileExists(atPath: url.path) {
            if let text = try? String(contentsOf: url, encoding: .utf8) {
                return TunnelLogParser.telemetry(from: String(text.suffix(80_000)))
            }
        }
        return TunnelTelemetry()
    }
}
