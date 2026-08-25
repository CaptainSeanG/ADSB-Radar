import SwiftUI

struct ContentView: View {
    @ObservedObject var model: DashboardModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                servicePanel(
                    title: "FAA TAIS Gateway",
                    snapshot: model.gatewayService,
                    kind: .gateway,
                    rows: { gatewayRows }
                )
                servicePanel(
                    title: "Cloudflare Tunnel",
                    snapshot: model.tunnelService,
                    kind: .tunnel,
                    rows: { tunnelRows }
                )
                workerPanel
                usersPanel
                startupPanel
                eventsPanel
            }
            .padding(22)
        }
        .frame(minWidth: 720, minHeight: 690)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 12) {
            StatusDot(level: model.aggregateLevel, size: 14)
            VStack(alignment: .leading, spacing: 2) {
                Text("ADSB Radar Gateway").font(.title2.bold())
                Text("FAA TAIS infrastructure control and telemetry").foregroundStyle(.secondary)
            }
            Spacer()
            Button("Start All") { model.startAll() }.disabled(!model.combinedControlsEnabled)
            Button("Stop All") { model.stopAll() }.disabled(!model.combinedControlsEnabled)
            Button("Restart All") { model.restartAll() }.disabled(!model.combinedControlsEnabled)
            Button {
                Task { await model.refresh(forceWorker: true) }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help("Refresh")
        }
    }

    private var controlsInstalled: Bool {
        model.gatewayService.installed && model.tunnelService.installed
    }

    @ViewBuilder
    private var gatewayRows: some View {
        metricRow("PID", value: model.gatewayService.pid.map(String.init) ?? "--")
        metricRow("Process uptime", value: duration(model.gatewayService.uptimeSeconds))
        metricRow("FAA JMS", value: model.gatewayHealth?.connectionState.uppercased() ?? "--")
        metricRow("Queue", value: model.gatewayHealth?.queueConnected == true ? "CONNECTED" : "--")
        metricRow("Last FAA message", value: age(model.gatewayHealth?.lastMessageAgeSeconds))
        metricRow("JMS messages/sec", value: decimal(model.gatewayHealth?.messagesPerSecond))
        metricRow("Positions/sec", value: decimal(model.gatewayHealth?.normalizedPositionUpdatesPerSecond))
        metricRow("Active tracks", value: model.gatewayHealth?.activeTracks.description ?? "--")
        metricRow("Parse errors", value: model.gatewayHealth?.parseErrors.description ?? "--")
        metricRow("Reconnects", value: model.gatewayHealth?.reconnects.description ?? "--")
    }

    @ViewBuilder
    private var tunnelRows: some View {
        metricRow("PID", value: model.tunnelService.pid.map(String.init) ?? "--")
        metricRow("Process uptime", value: duration(model.tunnelService.uptimeSeconds))
        metricRow("Mode", value: model.tunnelTelemetry.mode)
        metricRow("Public URL", value: model.tunnelTelemetry.publicURL ?? "--", monospaced: true)
        metricRow("Local target", value: model.tunnelTelemetry.localTarget, monospaced: true)
        metricRow("Connected", value: model.tunnelTelemetry.connectedAt?.formatted(date: .abbreviated, time: .standard) ?? "--")
        metricRow("Tunnel health latency", value: model.tunnelTelemetry.latencyMilliseconds.map { String(format: "%.0f ms", $0) } ?? "--")
    }

    private func servicePanel<Rows: View>(title: String, snapshot: ServiceSnapshot, kind: ServiceKind, @ViewBuilder rows: () -> Rows) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    StatusDot(level: snapshot.level)
                    Text(snapshot.state.uppercased()).font(.headline)
                    Text(snapshot.detail).foregroundStyle(.secondary)
                    Spacer()
                    Button("START") { model.start(kind) }.disabled(!snapshot.installed || snapshot.pid != nil)
                    Button("STOP") { model.stop(kind) }
                    .disabled(!snapshot.installed || snapshot.pid == nil)
                    Button("RESTART") { model.restart(kind) }
                    .disabled(snapshot.pid == nil && !snapshot.installed)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 8) {
                    rows()
                }
            }
            .padding(4)
        } label: {
            Text(title).font(.headline)
        }
    }

    private var workerPanel: some View {
        GroupBox("ADSB Radar Service") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    StatusDot(level: model.workerHealth?.ok == true ? .healthy : .degraded)
                    Text(model.workerHealth?.ok == true ? "HEALTHY" : "UNAVAILABLE").font(.headline)
                    Spacer()
                    Text(model.workerHealth?.workerVersion ?? "--").font(.system(.caption, design: .monospaced))
                }
                HStack(spacing: 24) {
                    metricRow("TAIS configured", value: yesNo(model.workerHealth?.taisGatewayConfigured))
                    metricRow("TAIS source", value: model.workerHealth?.taisState?.state.uppercased() ?? "--")
                    metricRow("Presence telemetry", value: yesNo(model.workerHealth?.activeClientTelemetryConfigured))
                }
            }
            .padding(4)
        }
    }

    private var usersPanel: some View {
        GroupBox("ADSB Radar Users") {
            if let metrics = model.userMetrics {
                HStack(spacing: 26) {
                    counter("Active Now", metrics.activeClients2m)
                    counter("15 Minutes", metrics.activeClients15m)
                    counter("Last Hour", metrics.activeClients1h)
                    counter("Requests/min", metrics.requestsPerMinute)
                    counter("FAA TAIS", metrics.sources.faaTais)
                    counter("Internet", metrics.sources.internet)
                }
                .padding(4)
            } else {
                Text(model.adminTelemetryConfigured ? "Protected metrics endpoint is unavailable." : "Admin metrics token is not configured in Keychain.")
                    .foregroundStyle(.secondary)
                    .padding(4)
            }
        }
    }

    private var startupPanel: some View {
        GroupBox("Service Management") {
            HStack(spacing: 20) {
                Toggle("Start TAIS Gateway at Login", isOn: Binding(
                    get: { model.gatewayAtLogin },
                    set: { model.setRunAtLogin($0, kind: .gateway) }
                ))
                .disabled(!model.gatewayService.installed)
                Toggle("Start Cloudflare Tunnel at Login", isOn: Binding(
                    get: { model.tunnelAtLogin },
                    set: { model.setRunAtLogin($0, kind: .tunnel) }
                ))
                .disabled(!model.tunnelService.installed)
                Spacer()
                if !controlsInstalled {
                    Button("Install Service Definitions") { model.installControls() }
                }
                Button("Reveal Logs") { model.revealLogs() }
            }
            .padding(4)
        }
    }

    private var eventsPanel: some View {
        GroupBox("Recent Events") {
            VStack(alignment: .leading, spacing: 5) {
                if model.events.isEmpty {
                    Text("No recent state changes.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.events.prefix(8)) { event in
                        HStack {
                            StatusDot(level: event.level, size: 7)
                            Text(event.timestamp.formatted(date: .omitted, time: .standard))
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                            Text(event.message).font(.caption)
                        }
                    }
                }
                if !model.message.isEmpty {
                    Divider()
                    Text(model.message).font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(4)
        }
    }

    private func counter(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(value)).font(.title2.monospacedDigit().bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func metricRow(_ label: String, value: String, monospaced: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .font(monospaced ? .system(.caption, design: .monospaced) : .caption)
                .lineLimit(1)
                .textSelection(.enabled)
        }
    }

    private func age(_ seconds: Double?) -> String {
        guard let seconds else { return "--" }
        return String(format: "%.1f sec ago", seconds)
    }

    private func decimal(_ value: Double?) -> String {
        guard let value else { return "--" }
        return String(format: "%.2f", value)
    }

    private func duration(_ seconds: TimeInterval?) -> String {
        guard let seconds else { return "--" }
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = seconds >= 86400 ? [.day, .hour] : [.hour, .minute, .second]
        formatter.unitsStyle = .abbreviated
        return formatter.string(from: seconds) ?? "--"
    }

    private func yesNo(_ value: Bool?) -> String {
        guard let value else { return "--" }
        return value ? "YES" : "NO"
    }
}

struct StatusDot: View {
    let level: HealthLevel
    var size: CGFloat = 10

    var body: some View {
        Circle().fill(color).frame(width: size, height: size).accessibilityLabel(level.rawValue)
    }

    private var color: Color {
        switch level {
        case .healthy: .green
        case .degraded: .orange
        case .failed: .red
        case .disabled: .gray
        }
    }
}
