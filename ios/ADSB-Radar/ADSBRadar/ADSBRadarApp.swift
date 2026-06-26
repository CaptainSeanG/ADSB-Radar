import SwiftUI

@main
struct ADSBRadarApp: App {
    @StateObject private var stratusBridge = StratusBridge()

    var body: some Scene {
        WindowGroup {
            ContentView(stratusBridge: stratusBridge)
                .onAppear {
                    stratusBridge.start()
                }
        }
    }
}
