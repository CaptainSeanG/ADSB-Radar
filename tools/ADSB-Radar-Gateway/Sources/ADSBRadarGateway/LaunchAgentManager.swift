import Foundation

enum ServiceControlError: LocalizedError {
    case missingGatewayEnvironment
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingGatewayEnvironment:
            "The protected TAIS gateway environment file was not found."
        case .commandFailed(let detail):
            detail
        }
    }
}

struct LaunchAgentManager: @unchecked Sendable {
    let fileManager = FileManager.default
    let userID = getuid()

    var home: URL { fileManager.homeDirectoryForCurrentUser }
    var supportDirectory: URL { home.appendingPathComponent("Library/Application Support/ADSB Radar Gateway", isDirectory: true) }
    var launchAgentsDirectory: URL { home.appendingPathComponent("Library/LaunchAgents", isDirectory: true) }
    var gatewayEnvironment: URL { supportDirectory.appendingPathComponent("gateway.env") }
    var gatewayLog: URL { supportDirectory.appendingPathComponent("tais-gateway.log") }
    var tunnelLog: URL { supportDirectory.appendingPathComponent("tais-tunnel.log") }

    func plistURL(for kind: ServiceKind) -> URL {
        launchAgentsDirectory.appendingPathComponent("\(kind.label).plist")
    }

    func isInstalled(_ kind: ServiceKind) -> Bool {
        fileManager.fileExists(atPath: plistURL(for: kind).path)
    }

    func snapshot(_ kind: ServiceKind) -> ServiceSnapshot {
        let result = CommandRunner.run("/bin/launchctl", ["print", "gui/\(userID)/\(kind.label)"])
        var snapshot = LaunchctlParser.snapshot(from: result.output, installed: isInstalled(kind))
        if let pid = snapshot.pid {
            let elapsed = CommandRunner.run("/bin/ps", ["-p", String(pid), "-o", "etime="])
            snapshot.uptimeSeconds = LaunchctlParser.elapsedSeconds(elapsed.output)
        }
        if result.status != 0 && isInstalled(kind) {
            snapshot.level = .failed
            snapshot.state = "Stopped"
        }
        return snapshot
    }

    func installDefinitions() throws {
        try fileManager.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: launchAgentsDirectory, withIntermediateDirectories: true)

        if !fileManager.fileExists(atPath: gatewayEnvironment.path) {
            let current = URL(fileURLWithPath: "/private/tmp/adsb-radar-tais-gateway.env")
            guard fileManager.fileExists(atPath: current.path) else { throw ServiceControlError.missingGatewayEnvironment }
            try fileManager.copyItem(at: current, to: gatewayEnvironment)
            try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: gatewayEnvironment.path)
        }

        try writePlist(gatewayPlist(), to: plistURL(for: .gateway))
        try writePlist(tunnelPlist(), to: plistURL(for: .tunnel))
    }

    func setRunAtLogin(_ enabled: Bool, for kind: ServiceKind) throws {
        let url = plistURL(for: kind)
        guard var object = NSDictionary(contentsOf: url) as? [String: Any] else {
            throw ServiceControlError.commandFailed("Install the service definitions first.")
        }
        object["RunAtLoad"] = enabled
        object["KeepAlive"] = enabled
        try writePlist(object, to: url)
    }

    func runAtLogin(_ kind: ServiceKind) -> Bool {
        guard let object = NSDictionary(contentsOf: plistURL(for: kind)) as? [String: Any] else { return true }
        return object["RunAtLoad"] as? Bool ?? true
    }

    func start(_ kind: ServiceKind) throws {
        guard isInstalled(kind) else {
            throw ServiceControlError.commandFailed("Install the dedicated service definitions before starting or stopping services.")
        }
        let domain = "gui/\(userID)"
        let current = CommandRunner.run("/bin/launchctl", ["print", "\(domain)/\(kind.label)"])
        if current.status != 0 {
            let bootstrap = CommandRunner.run("/bin/launchctl", ["bootstrap", domain, plistURL(for: kind).path])
            guard bootstrap.status == 0 else { throw ServiceControlError.commandFailed(redacted(bootstrap.error)) }
        }
        let kickstart = CommandRunner.run("/bin/launchctl", ["kickstart", "\(domain)/\(kind.label)"])
        guard kickstart.status == 0 else { throw ServiceControlError.commandFailed(redacted(kickstart.error)) }
    }

    func stop(_ kind: ServiceKind) throws {
        guard isInstalled(kind) else {
            throw ServiceControlError.commandFailed("Install the dedicated service definitions before stopping services.")
        }
        let result = CommandRunner.run("/bin/launchctl", ["bootout", "gui/\(userID)/\(kind.label)"])
        if result.status != 0 && !result.error.localizedCaseInsensitiveContains("could not find") {
            throw ServiceControlError.commandFailed(redacted(result.error))
        }
    }

    func restart(_ kind: ServiceKind) throws {
        let domainLabel = "gui/\(userID)/\(kind.label)"
        let current = CommandRunner.run("/bin/launchctl", ["print", domainLabel])
        if current.status != 0 {
            try start(kind)
            return
        }
        let result = CommandRunner.run("/bin/launchctl", ["kickstart", "-k", domainLabel])
        guard result.status == 0 else { throw ServiceControlError.commandFailed(redacted(result.error)) }
    }

    private func gatewayPlist() -> [String: Any] {
        [
            "Label": ServiceKind.gateway.label,
            "ProgramArguments": [
                "/Users/seangallagher/ADSB-Radar/scripts/run-tais-gateway.sh",
                gatewayEnvironment.path
            ],
            "RunAtLoad": true,
            "KeepAlive": true,
            "ProcessType": "Background",
            "StandardOutPath": gatewayLog.path,
            "StandardErrorPath": gatewayLog.path
        ]
    }

    private func tunnelPlist() -> [String: Any] {
        let cloudflared = fileManager.isExecutableFile(atPath: "/opt/homebrew/opt/cloudflared/bin/cloudflared")
            ? "/opt/homebrew/opt/cloudflared/bin/cloudflared"
            : "/opt/homebrew/bin/cloudflared"
        return [
            "Label": ServiceKind.tunnel.label,
            "ProgramArguments": [
                cloudflared,
                "tunnel",
                "--config", PermanentTunnelConfiguration.configPath,
                "--no-autoupdate",
                "--logfile", tunnelLog.path,
                "run",
                PermanentTunnelConfiguration.name
            ],
            "RunAtLoad": true,
            "KeepAlive": true,
            "ProcessType": "Background",
            "StandardOutPath": tunnelLog.path,
            "StandardErrorPath": tunnelLog.path
        ]
    }

    private func writePlist(_ object: [String: Any], to url: URL) throws {
        let data = try PropertyListSerialization.data(fromPropertyList: object, format: .xml, options: 0)
        try data.write(to: url, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o644], ofItemAtPath: url.path)
    }

    private func redacted(_ value: String) -> String {
        value.replacingOccurrences(of: #"(?i)(token|password|credential)=[^\s,]+"#, with: "$1=<redacted>", options: .regularExpression)
    }
}
