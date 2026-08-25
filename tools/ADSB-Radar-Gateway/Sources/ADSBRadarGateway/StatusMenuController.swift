import AppKit
import Combine

@MainActor
final class StatusMenuController: NSObject, NSMenuDelegate {
    private let model: DashboardModel
    private let openDashboard: () -> Void
    private let quitApplication: () -> Void
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let gatewayItem = NSMenuItem(title: "Gateway: Checking", action: nil, keyEquivalent: "")
    private let tunnelItem = NSMenuItem(title: "Tunnel: Checking", action: nil, keyEquivalent: "")
    private let workerItem = NSMenuItem(title: "Worker: Checking", action: nil, keyEquivalent: "")
    private let startItem = NSMenuItem(title: "Start Services", action: #selector(startServices), keyEquivalent: "")
    private let stopItem = NSMenuItem(title: "Stop Services", action: #selector(stopServices), keyEquivalent: "")
    private let restartItem = NSMenuItem(title: "Restart Services", action: #selector(restartServices), keyEquivalent: "")
    private let safetyItem = NSMenuItem(title: "Controls disabled until permanent tunnel is connected", action: nil, keyEquivalent: "")
    private var subscriptions = Set<AnyCancellable>()

    init(model: DashboardModel, openDashboard: @escaping () -> Void, quitApplication: @escaping () -> Void) {
        self.model = model
        self.openDashboard = openDashboard
        self.quitApplication = quitApplication
        super.init()
        configureStatusItem()
        model.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] in
                DispatchQueue.main.async { self?.updatePresentation() }
            }
            .store(in: &subscriptions)
        updatePresentation()
    }

    func menuWillOpen(_ menu: NSMenu) {
        updatePresentation()
        Task { await model.refresh(forceWorker: true) }
    }

    private func configureStatusItem() {
        let menu = NSMenu()
        menu.delegate = self
        menu.addItem(withTitle: "Open ADSB Radar Gateway", action: #selector(openRequested), keyEquivalent: "")
            .target = self
        menu.addItem(.separator())
        [gatewayItem, tunnelItem, workerItem].forEach { menu.addItem($0) }
        menu.addItem(.separator())
        [startItem, stopItem, restartItem].forEach {
            $0.target = self
            menu.addItem($0)
        }
        safetyItem.isEnabled = false
        menu.addItem(safetyItem)
        menu.addItem(.separator())
        let quit = menu.addItem(withTitle: "Quit", action: #selector(quitRequested), keyEquivalent: "q")
        quit.target = self
        statusItem.menu = menu
    }

    private func updatePresentation() {
        let health = model.systemHealth
        updateStatusIcon(for: health.level)
        statusItem.button?.toolTip = "ADSB Radar Gateway: \(health.summary)"
        gatewayItem.title = "Gateway: \(model.gatewayService.state)"
        tunnelItem.title = "Tunnel: \(model.tunnelService.state)"
        if let worker = model.workerHealth {
            let tais = worker.taisState?.state.uppercased() ?? "UNKNOWN"
            workerItem.title = "Worker: \(worker.ok ? "Healthy" : "Unhealthy") / TAIS \(tais)"
        } else {
            workerItem.title = "Worker: Unavailable"
        }

        let controlsEnabled = model.combinedControlsEnabled
        startItem.isEnabled = controlsEnabled
        stopItem.isEnabled = controlsEnabled
        restartItem.isEnabled = controlsEnabled
        safetyItem.isHidden = controlsEnabled
    }

    private func updateStatusIcon(for level: HealthLevel) {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { [weak self] rect in
            guard let self else { return false }
            let center = NSPoint(x: rect.midX, y: rect.midY)

            self.color(for: level).setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1)).fill()

            NSColor.white.withAlphaComponent(0.92).setStroke()
            let scope = NSBezierPath(ovalIn: rect.insetBy(dx: 4, dy: 4))
            scope.lineWidth = 1.1
            scope.stroke()

            let crosshair = NSBezierPath()
            crosshair.move(to: NSPoint(x: center.x, y: 2.5))
            crosshair.line(to: NSPoint(x: center.x, y: rect.maxY - 2.5))
            crosshair.move(to: NSPoint(x: 2.5, y: center.y))
            crosshair.line(to: NSPoint(x: rect.maxX - 2.5, y: center.y))
            crosshair.lineWidth = 1
            crosshair.stroke()
            return true
        }
        image.isTemplate = false
        image.accessibilityDescription = "ADSB Radar Gateway status"
        statusItem.button?.image = image
    }

    private func color(for level: HealthLevel) -> NSColor {
        switch level {
        case .healthy: .systemGreen
        case .degraded: .systemOrange
        case .failed: .systemRed
        case .disabled: .systemGray
        }
    }

    @objc private func openRequested() {
        openDashboard()
    }

    @objc private func startServices() {
        guard model.combinedControlsEnabled else { return }
        model.startAll()
    }

    @objc private func stopServices() {
        guard model.combinedControlsEnabled else { return }
        model.stopAll()
    }

    @objc private func restartServices() {
        guard model.combinedControlsEnabled else { return }
        model.restartAll()
    }

    @objc private func quitRequested() {
        quitApplication()
    }
}
