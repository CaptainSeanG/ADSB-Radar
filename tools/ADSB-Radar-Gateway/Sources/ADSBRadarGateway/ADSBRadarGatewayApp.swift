import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let model = DashboardModel()
    private var mainWindow: NSWindow?
    private var statusMenuController: StatusMenuController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        statusMenuController = StatusMenuController(
            model: model,
            openDashboard: { [weak self] in self?.showMainWindow() },
            quitApplication: { NSApp.terminate(nil) }
        )
        model.startMonitoring()
        showMainWindow()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    func applicationOpenUntitledFile(_ sender: NSApplication) -> Bool {
        showMainWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        model.stopMonitoring()
    }

    func showMainWindow() {
        let window = mainWindow ?? makeMainWindow()
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Task { await model.refresh(forceWorker: true) }
    }

    private func makeMainWindow() -> NSWindow {
        let controller = NSHostingController(rootView: ContentView(model: model))
        let window = NSWindow(contentViewController: controller)
        window.title = "ADSB Radar Gateway"
        window.setContentSize(NSSize(width: 780, height: 780))
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        mainWindow = window
        return window
    }
}

@main
struct ADSBRadarGatewayApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        if CommandLine.arguments.contains("--install-service-definitions") {
            do {
                try LaunchAgentManager().installDefinitions()
                print("Installed ADSB Radar Gateway LaunchAgent definitions.")
                exit(EXIT_SUCCESS)
            } catch {
                FileHandle.standardError.write(Data("Installation failed: \(error.localizedDescription)\n".utf8))
                exit(EXIT_FAILURE)
            }
        }
    }

    var body: some Scene {
        Settings {
            EmptyView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open ADSB Radar Gateway") { appDelegate.showMainWindow() }
                    .keyboardShortcut("o")
            }
            CommandGroup(after: .appInfo) {
                Button("Refresh Status") { Task { await appDelegate.model.refresh(forceWorker: true) } }
                    .keyboardShortcut("r")
            }
        }
    }
}
