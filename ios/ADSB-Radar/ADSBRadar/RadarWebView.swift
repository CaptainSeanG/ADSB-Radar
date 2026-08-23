import SwiftUI
import WebKit

struct RadarWebView: UIViewRepresentable {
    @ObservedObject var stratusBridge: StratusBridge
    @Binding var notesText: String
    @Binding var scratchpadActive: Bool
    var onScratchpadRequested: () -> Void
    var onScratchpadDismissRequested: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            stratusBridge: stratusBridge,
            onScratchpadRequested: onScratchpadRequested,
            onScratchpadDismissRequested: onScratchpadDismissRequested
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "stratus")
        configuration.userContentController.add(context.coordinator, name: "scratchpad")
#if DEBUG
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: "window.ADSB_RADAR_DEBUG_TRAFFIC = true;",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
#endif
        configuration.setURLSchemeHandler(RadarAssetSchemeHandler(), forURLScheme: "adsbradar")
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.delegate = context.coordinator
        context.coordinator.webView = webView
        context.coordinator.installDeviceHeadingBridge()

        webView.load(URLRequest(url: URL(string: "adsbradar://app/index.html")!))

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onScratchpadRequested = onScratchpadRequested
        context.coordinator.onScratchpadDismissRequested = onScratchpadDismissRequested
        context.coordinator.sendNotesTextIfNeeded(notesText)
        context.coordinator.sendScratchpadPauseIfNeeded(scratchpadActive)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, UIScrollViewDelegate {
        let stratusBridge: StratusBridge
        var onScratchpadRequested: () -> Void
        var onScratchpadDismissRequested: () -> Void
        weak var webView: WKWebView?
        private var lastSentNotesText: String?
        private var lastSentScratchpadActive: Bool?

        init(
            stratusBridge: StratusBridge,
            onScratchpadRequested: @escaping () -> Void,
            onScratchpadDismissRequested: @escaping () -> Void
        ) {
            self.stratusBridge = stratusBridge
            self.onScratchpadRequested = onScratchpadRequested
            self.onScratchpadDismissRequested = onScratchpadDismissRequested
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            nil
        }

        func installDeviceHeadingBridge() {
            stratusBridge.onDeviceHeadingUpdate = { [weak self] payload in
                self?.sendDeviceHeading(payload)
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "scratchpad" {
                let type = (message.body as? [String: Any])?["type"] as? String
                DispatchQueue.main.async {
                    if type == "dismissForTrafficAlert" {
                        self.onScratchpadDismissRequested()
                    } else {
                        self.onScratchpadRequested()
                    }
                }
                return
            }

            guard message.name == "stratus",
                  let body = message.body as? [String: Any],
                  let id = body["id"] as? String,
                  let type = body["type"] as? String
            else {
                return
            }

            switch type {
            case "aircraft":
                let payload = stratusBridge.aircraftPayload()
                sendResponse(id: id, type: type, payload: payload)
            case "deviceStatus":
                sendResponse(id: id, type: type, payload: DeviceStatusPayload.current)
            default:
                sendError(id: id, type: type, message: "Unsupported native Stratus request")
            }
        }

        func sendNotesTextIfNeeded(_ text: String) {
            guard text != lastSentNotesText else { return }
            lastSentNotesText = text
            let escaped = text
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
            let script = """
            window.dispatchEvent(new CustomEvent("adsb-set-quick-note-text", {
              detail: {"text":"\(escaped)"}
            }));
            """
            DispatchQueue.main.async {
                self.webView?.evaluateJavaScript(script)
            }
        }

        func sendScratchpadPauseIfNeeded(_ active: Bool) {
            guard active != lastSentScratchpadActive else { return }
            lastSentScratchpadActive = active
            let script = """
            window.dispatchEvent(new CustomEvent("adsb-scratchpad-pause", {
              detail: {"paused":\(active ? "true" : "false")}
            }));
            """
            DispatchQueue.main.async {
                self.webView?.evaluateJavaScript(script)
            }
        }

        private func sendDeviceHeading(_ payload: DeviceHeadingPayload) {
            do {
                let payloadData = try JSONEncoder().encode(payload)
                guard let payloadJSON = String(data: payloadData, encoding: .utf8) else { return }
                let script = """
                window.dispatchEvent(new CustomEvent("adsb-native-device-heading", {
                  detail: \(payloadJSON)
                }));
                """
                self.webView?.evaluateJavaScript(script)
            } catch {
                return
            }
        }

        private func sendResponse<T: Encodable>(id: String, type: String, payload: T) {
            do {
                let payloadData = try JSONEncoder().encode(payload)
                guard let payloadJSON = String(data: payloadData, encoding: .utf8) else {
                    sendError(id: id, type: type, message: "Unable to encode native Stratus response")
                    return
                }
                evaluateResponseScript(id: id, type: type, detail: "\"payload\":\(payloadJSON)")
            } catch {
                sendError(id: id, type: type, message: error.localizedDescription)
            }
        }

        private func sendError(id: String, type: String, message: String) {
            let escaped = message
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
            evaluateResponseScript(id: id, type: type, detail: "\"error\":\"\(escaped)\"")
        }

        private func evaluateResponseScript(id: String, type: String, detail: String) {
            let escapedId = id.replacingOccurrences(of: "\"", with: "\\\"")
            let escapedType = type.replacingOccurrences(of: "\"", with: "\\\"")
            let script = """
            window.dispatchEvent(new CustomEvent("adsb-native-stratus-response", {
              detail: {"id":"\(escapedId)","type":"\(escapedType)",\(detail)}
            }));
            """
            DispatchQueue.main.async {
                self.webView?.evaluateJavaScript(script)
            }
        }
    }
}

struct DeviceStatusPayload: Codable {
    let thermalState: String
    let thermalLabel: String
    let lowPowerMode: Bool

    static var current: DeviceStatusPayload {
        let lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
        switch ProcessInfo.processInfo.thermalState {
        case .nominal:
            return DeviceStatusPayload(thermalState: "nominal", thermalLabel: "Normal", lowPowerMode: lowPowerMode)
        case .fair:
            return DeviceStatusPayload(thermalState: "fair", thermalLabel: "Warm", lowPowerMode: lowPowerMode)
        case .serious:
            return DeviceStatusPayload(thermalState: "serious", thermalLabel: "Hot", lowPowerMode: lowPowerMode)
        case .critical:
            return DeviceStatusPayload(thermalState: "critical", thermalLabel: "Critical", lowPowerMode: lowPowerMode)
        @unknown default:
            return DeviceStatusPayload(thermalState: "unknown", thermalLabel: "Unknown", lowPowerMode: lowPowerMode)
        }
    }
}

final class RadarAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private let mimeTypes = [
        "html": "text/html; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "svg": "image/svg+xml; charset=utf-8",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg"
    ]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            finish(urlSchemeTask, status: 400, body: Data("Bad request".utf8), mimeType: "text/plain; charset=utf-8")
            return
        }

        let requestedPath = normalizedPath(for: url)
        let resolvedURL = applicationSupportOverride(for: requestedPath)
            ?? Bundle.main.url(forResource: "public", withExtension: nil)?.appendingPathComponent(requestedPath)

        guard let assetURL = resolvedURL,
              isSafeAssetURL(assetURL),
              let data = try? Data(contentsOf: assetURL)
        else {
            finish(urlSchemeTask, status: 404, body: Self.notFoundHTML, mimeType: "text/html; charset=utf-8")
            return
        }

        let mimeType = mimeTypes[assetURL.pathExtension.lowercased()] ?? "application/octet-stream"
        finish(urlSchemeTask, status: 200, body: data, mimeType: mimeType)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func normalizedPath(for url: URL) -> String {
        let rawPath = url.path == "/" || url.path.isEmpty ? "/index.html" : url.path
        let parts = rawPath
            .split(separator: "/")
            .filter { !$0.isEmpty && $0 != "." && $0 != ".." }
        return parts.joined(separator: "/")
    }

    private func isSafeAssetURL(_ url: URL) -> Bool {
        if let supportURL = offlineDataDirectory(),
           url.standardizedFileURL.path.hasPrefix(supportURL.standardizedFileURL.path) {
            return true
        }

        guard let publicURL = Bundle.main.url(forResource: "public", withExtension: nil) else {
            return false
        }
        return url.standardizedFileURL.path.hasPrefix(publicURL.standardizedFileURL.path)
    }

    private func applicationSupportOverride(for requestedPath: String) -> URL? {
        guard requestedPath.hasPrefix("data/"),
              let supportURL = offlineDataDirectory()
        else {
            return nil
        }

        let candidate = supportURL.appendingPathComponent(String(requestedPath.dropFirst("data/".count)))
        return FileManager.default.fileExists(atPath: candidate.path) ? candidate : nil
    }

    private func offlineDataDirectory() -> URL? {
        guard let appSupportURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }

        let directory = appSupportURL
            .appendingPathComponent("ADSB Radar", isDirectory: true)
            .appendingPathComponent("OfflineData", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func finish(_ task: WKURLSchemeTask, status: Int, body: Data, mimeType: String) {
        let response = HTTPURLResponse(
            url: task.request.url ?? URL(string: "adsbradar://app/index.html")!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mimeType,
                "Cache-Control": "no-store"
            ]
        )!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    private static let notFoundHTML = Data("""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020503;color:#e9fff3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;">
        <main style="max-width:32rem;padding:2rem;line-height:1.4;">
          <h1 style="font-size:1.4rem;">ADSB Radar asset not found</h1>
          <p>The iOS app could not find one of the bundled radar UI files.</p>
          <p>Clean the build folder and run again from Xcode.</p>
        </main>
      </body>
    </html>
    """.utf8)
}
