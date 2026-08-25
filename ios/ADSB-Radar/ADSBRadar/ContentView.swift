import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var stratusBridge: StratusBridge
    @State private var notesText = ""
    @State private var showingScratchpad = false
    @State private var scratchpadState = ATCScratchpadState()

    var body: some View {
        ZStack {
            RadarWebView(
                stratusBridge: stratusBridge,
                notesText: $notesText,
                scratchpadActive: $showingScratchpad,
                appActive: scenePhase == .active,
                onScratchpadRequested: { showingScratchpad = true },
                onScratchpadDismissRequested: { showingScratchpad = false }
            )
            .ignoresSafeArea()

            if showingScratchpad {
                Color.black.opacity(0.78)
                    .ignoresSafeArea()

                ATCScratchpadView(
                    noteText: $notesText,
                    scratchpad: $scratchpadState,
                    onDismiss: { showingScratchpad = false }
                )
                .frame(maxWidth: 620, maxHeight: 760)
                .padding(.horizontal, 18)
                .transition(.scale(scale: 0.96).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.16), value: showingScratchpad)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}
