import SwiftUI
import UIKit

struct ContentView: View {
    @ObservedObject var stratusBridge: StratusBridge

    var body: some View {
        RadarWebView(stratusBridge: stratusBridge)
            .ignoresSafeArea()
            .onAppear {
                UIApplication.shared.isIdleTimerDisabled = true
            }
            .onDisappear {
                UIApplication.shared.isIdleTimerDisabled = false
            }
    }
}
