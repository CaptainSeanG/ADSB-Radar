import SwiftUI
import UIKit

struct ContentView: View {
    @ObservedObject var stratusBridge: StratusBridge
    @State private var notesText = ""
    @State private var showingScratchpad = false

    var body: some View {
        RadarWebView(
            stratusBridge: stratusBridge,
            notesText: $notesText,
            onScratchpadRequested: { showingScratchpad = true }
        )
            .ignoresSafeArea()
            .onAppear {
                UIApplication.shared.isIdleTimerDisabled = true
            }
            .onDisappear {
                UIApplication.shared.isIdleTimerDisabled = false
            }
            .sheet(isPresented: $showingScratchpad) {
                ATCScratchpadView(noteText: $notesText)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
    }
}
