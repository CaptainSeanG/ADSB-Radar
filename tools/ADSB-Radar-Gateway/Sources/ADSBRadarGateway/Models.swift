import Foundation

enum PermanentTunnelConfiguration {
    static let name = "adsb-radar-tais"
    static let hostname = "tais.adsbradar.net"
    static let publicURL = "https://tais.adsbradar.net"
    static let localTarget = "http://127.0.0.1:8788"
    static let configPath = "/Users/seangallagher/.cloudflared/adsb-radar-tais.yml"
}

enum HealthLevel: String, Codable, CaseIterable {
    case healthy
    case degraded
    case failed
    case disabled
}

struct ServiceSnapshot: Equatable {
    var level: HealthLevel = .disabled
    var state = "Unknown"
    var pid: Int?
    var uptimeSeconds: TimeInterval?
    var detail = ""
    var installed = false
}

struct SystemHealth: Equatable {
    var level: HealthLevel
    var summary: String

    static let starting = SystemHealth(level: .degraded, summary: "Checking services")
}

enum HealthEvaluator {
    static let healthyFAAMessageAgeSeconds: Double = 30
    static let failedFAAMessageAgeSeconds: Double = 60

    static func evaluate(
        gatewayService: ServiceSnapshot,
        tunnelService: ServiceSnapshot,
        gatewayHealth: GatewayHealth?,
        tunnelTelemetry: TunnelTelemetry,
        workerHealth: WorkerHealth?,
        consecutiveWorkerFailures: Int
    ) -> SystemHealth {
        if !gatewayService.installed || !tunnelService.installed {
            return SystemHealth(level: .disabled, summary: "Service definitions not installed")
        }
        if gatewayService.pid == nil {
            return SystemHealth(level: .failed, summary: "TAIS gateway stopped")
        }
        if tunnelService.pid == nil {
            return SystemHealth(level: .failed, summary: "Cloudflare tunnel stopped")
        }

        if let gatewayHealth {
            let state = gatewayHealth.connectionState.lowercased()
            let messageAge = gatewayHealth.lastMessageAgeSeconds ?? .infinity
            if !gatewayHealth.connected || gatewayHealth.queueConnected == false || messageAge > failedFAAMessageAgeSeconds {
                return SystemHealth(level: .failed, summary: "FAA TAIS connection failed")
            }
            if !gatewayHealth.ok || state != "live" || messageAge > healthyFAAMessageAgeSeconds {
                return SystemHealth(level: .degraded, summary: "FAA TAIS connecting or stale")
            }
        } else {
            return SystemHealth(level: .degraded, summary: "Gateway telemetry unavailable")
        }

        if tunnelTelemetry.connectedAt == nil || tunnelTelemetry.latencyMilliseconds == nil {
            return SystemHealth(level: .degraded, summary: "Tunnel connecting or unreachable")
        }

        guard let workerHealth else {
            return SystemHealth(
                level: consecutiveWorkerFailures >= 2 ? .failed : .degraded,
                summary: consecutiveWorkerFailures >= 2 ? "Worker unreachable" : "Checking Worker"
            )
        }
        if !workerHealth.ok {
            return SystemHealth(level: .failed, summary: "Worker unhealthy")
        }
        if workerHealth.taisState?.selected != true || workerHealth.taisState?.state.lowercased() != "live" {
            return SystemHealth(level: .degraded, summary: "Worker TAIS source degraded")
        }
        return SystemHealth(level: .healthy, summary: "FAA TAIS live")
    }
}

struct GatewayHealth: Codable, Equatable {
    var ok: Bool
    var gatewayVersion: String
    var startedAt: String?
    var uptimeSeconds: Double?
    var connectionState: String
    var connected: Bool
    var queueConnected: Bool?
    var lastMessageTimestamp: String?
    var lastMessageAgeSeconds: Double?
    var messagesPerSecond: Double
    var normalizedPositionUpdatesPerSecond: Double
    var activeTracks: Int
    var parseErrors: Int
    var reconnects: Int
}

struct WorkerHealth: Codable, Equatable {
    struct TaisState: Codable, Equatable {
        var selected: Bool
        var state: String
        var lastAttemptAgeSeconds: Double?
        var reason: String?
    }

    var ok: Bool
    var workerVersion: String
    var taisGatewayConfigured: Bool?
    var activeClientTelemetryConfigured: Bool?
    var taisState: TaisState?
}

struct UserMetrics: Codable, Equatable {
    struct Sources: Codable, Equatable {
        var faaTais: Int = 0
        var local: Int = 0
        var internet: Int = 0
        var stale: Int = 0
        var noData: Int = 0
        var unknown: Int = 0
    }

    var activeClients2m: Int
    var activeClients15m: Int
    var activeClients1h: Int
    var requestsPerMinute: Int
    var sources: Sources
    var generatedAt: String?
}

struct TunnelTelemetry: Equatable {
    var mode = "Unknown"
    var publicURL: String?
    var localTarget = PermanentTunnelConfiguration.localTarget
    var connectedAt: Date?
    var latencyMilliseconds: Double?
}

struct OperationalEvent: Identifiable, Equatable {
    let id = UUID()
    let timestamp: Date
    let message: String
    let level: HealthLevel
}

enum ServiceKind: String, CaseIterable, Identifiable {
    case gateway
    case tunnel

    var id: String { rawValue }
    var label: String {
        switch self {
        case .gateway: "com.captainseang.adsbradar.tais-gateway"
        case .tunnel: "com.captainseang.adsbradar.tais-tunnel"
        }
    }
}
