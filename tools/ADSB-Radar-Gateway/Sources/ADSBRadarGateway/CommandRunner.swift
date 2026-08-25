import Foundation

struct CommandResult: Equatable {
    let status: Int32
    let output: String
    let error: String
}

enum CommandRunner {
    static func run(_ executable: String, _ arguments: [String]) -> CommandResult {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = stdout
        process.standardError = stderr
        do {
            try process.run()
            process.waitUntilExit()
            return CommandResult(
                status: process.terminationStatus,
                output: String(decoding: stdout.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self),
                error: String(decoding: stderr.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            )
        } catch {
            return CommandResult(status: -1, output: "", error: error.localizedDescription)
        }
    }
}

enum LaunchctlParser {
    static func snapshot(from output: String, installed: Bool) -> ServiceSnapshot {
        let state = capture(#"state = ([^\n]+)"#, in: output) ?? "unknown"
        let pid = capture(#"pid = (\d+)"#, in: output).flatMap(Int.init)
        let running = state.trimmingCharacters(in: .whitespacesAndNewlines) == "running" && pid != nil
        return ServiceSnapshot(
            level: running ? .healthy : (installed ? .failed : .disabled),
            state: running ? "Running" : (installed ? "Stopped" : "Not Installed"),
            pid: pid,
            detail: running ? "Managed by launchd" : "",
            installed: installed
        )
    }

    static func elapsedSeconds(_ value: String) -> TimeInterval? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let dayParts = trimmed.split(separator: "-", maxSplits: 1).map(String.init)
        let days = dayParts.count == 2 ? Double(dayParts[0]) ?? 0 : 0
        let clock = (dayParts.count == 2 ? dayParts[1] : dayParts[0]).split(separator: ":").compactMap { Double($0) }
        guard clock.count == 2 || clock.count == 3 else { return nil }
        let hours = clock.count == 3 ? clock[0] : 0
        let minutes = clock.count == 3 ? clock[1] : clock[0]
        let seconds = clock.count == 3 ? clock[2] : clock[1]
        return days * 86400 + hours * 3600 + minutes * 60 + seconds
    }

    private static func capture(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[range])
    }
}

enum TunnelLogParser {
    static func telemetry(from text: String) -> TunnelTelemetry {
        var telemetry = TunnelTelemetry()
        let quickRange = text.range(
            of: #"https://[A-Za-z0-9-]+\.trycloudflare\.com"#,
            options: [.regularExpression, .backwards]
        )
        let namedRange = text.range(of: "credentials-file", options: [.caseInsensitive, .backwards])
        if let namedRange, quickRange == nil || namedRange.lowerBound > quickRange!.lowerBound {
            telemetry.mode = "Permanent Named Tunnel"
            telemetry.publicURL = PermanentTunnelConfiguration.publicURL
        } else if let quickRange {
            telemetry.mode = "Legacy Quick Tunnel"
            telemetry.publicURL = String(text[quickRange])
        }
        if let line = text.split(separator: "\n").last(where: { $0.localizedCaseInsensitiveContains("Registered tunnel connection") }),
           let data = line.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let value = object["time"] as? String {
            telemetry.connectedAt = ISO8601DateFormatter().date(from: value)
        }
        return telemetry
    }
}
