import SwiftUI
import Foundation

enum ATCScratchpadMode: String, CaseIterable, Identifiable {
    case heading = "HDG"
    case altitude = "ALT"
    case speed = "SPD"
    case frequency = "FREQ"
    case squawk = "SQK"

    var id: String { rawValue }
}

enum ATCScratchpadDirection: String {
    case left = "LEFT"
    case right = "RIGHT"
}

enum ATCScratchpadVertical: String {
    case climb = "CLIMB"
    case descend = "DESCEND"
}

struct ATCScratchpadState: Equatable {
    var activeMode: ATCScratchpadMode = .heading
    var heading = ""
    var altitude = ""
    var speed = ""
    var frequency = ""
    var squawk = ""
    var freeNotes = ""
    var direction: ATCScratchpadDirection?
    var vertical: ATCScratchpadVertical?
    var direct = false
    var readback = ""

    var compactSummary: String {
        let lines = summaryLines
        return lines.isEmpty ? "ATC scratchpad empty" : lines.joined(separator: " / ")
    }

    var summaryLines: [String] {
        var lines: [String] = []
        if let direction, let heading = formattedHeading {
            lines.append("\(direction.rawValue) \(heading)")
        } else if let heading = formattedHeading {
            lines.append(heading)
        }
        if let vertical, let altitude = formattedAltitude {
            lines.append("\(vertical.rawValue) \(altitude)")
        } else if let altitude = formattedAltitude {
            lines.append(altitude)
        }
        if let speed = formattedSpeed {
            lines.append(speed)
        }
        if let frequency = formattedFrequency {
            lines.append(frequency)
        }
        if let squawk = formattedSquawk {
            lines.append(squawk)
        }
        if direct {
            lines.append("DIRECT")
        }
        if !freeNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append(freeNotes.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return lines
    }

    var readbackSentence: String {
        var phrases: [String] = []
        if let heading = formattedHeading {
            let headingValue = heading.replacingOccurrences(of: "HDG ", with: "")
            let turn = direction == .left ? "left turn" : direction == .right ? "right turn" : "turn"
            phrases.append("\(turn) heading \(headingValue)")
        }
        if let altitude = formattedAltitude {
            let altitudeValue = altitude.replacingOccurrences(of: "ALT ", with: "")
            let verb = vertical == .descend ? "descend and maintain" : "climb and maintain"
            phrases.append("\(verb) \(altitudeValue)")
        }
        if let speed = formattedSpeed {
            let speedValue = speed
                .replacingOccurrences(of: "SPD ", with: "")
                .replacingOccurrences(of: " KT", with: "")
            phrases.append("slow to \(speedValue) knots")
        }
        if let frequency = formattedFrequency {
            phrases.append("contact \(frequency.replacingOccurrences(of: "FREQ ", with: ""))")
        }
        if let squawk = formattedSquawk {
            phrases.append("squawk \(squawk.replacingOccurrences(of: "SQK ", with: ""))")
        }
        if direct {
            phrases.append("direct")
        }
        if !freeNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            phrases.append(freeNotes.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return phrases.isEmpty ? "No clearance entered." : phrases.joined(separator: ", ") + "."
    }

    var formattedHeading: String? {
        let digits = heading.filter(\.isNumber)
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        return "HDG \(String(format: "%03d", min(max(value, 0), 360)))"
    }

    var formattedAltitude: String? {
        let digits = altitude.filter(\.isNumber)
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return "ALT \(formatter.string(from: NSNumber(value: value)) ?? "\(value)")"
    }

    var formattedSpeed: String? {
        let digits = speed.filter(\.isNumber)
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        return "SPD \(value) KT"
    }

    var formattedFrequency: String? {
        let cleaned = frequency.filter { $0.isNumber || $0 == "." }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.contains(".") {
            return "FREQ \(cleaned)"
        }
        guard cleaned.count > 3 else { return "FREQ \(cleaned)" }
        let index = cleaned.index(cleaned.startIndex, offsetBy: 3)
        let whole = cleaned[..<index]
        let decimal = cleaned[index...].prefix(2)
        return "FREQ \(whole).\(decimal)"
    }

    var formattedSquawk: String? {
        let digits = String(squawk.filter(\.isNumber).prefix(4))
        guard !digits.isEmpty else { return nil }
        return "SQK \(digits)"
    }

    mutating func append(_ value: String) {
        switch activeMode {
        case .heading:
            heading = limited(heading + value, count: 3, decimalAllowed: false)
        case .altitude:
            altitude = limited(altitude + value, count: 5, decimalAllowed: false)
        case .speed:
            speed = limited(speed + value, count: 3, decimalAllowed: false)
        case .frequency:
            frequency = limited(frequency + value, count: 6, decimalAllowed: true)
        case .squawk:
            squawk = limited(squawk + value, count: 4, decimalAllowed: false)
        }
    }

    mutating func backspace() {
        switch activeMode {
        case .heading:
            _ = heading.popLast()
        case .altitude:
            _ = altitude.popLast()
        case .speed:
            _ = speed.popLast()
        case .frequency:
            _ = frequency.popLast()
        case .squawk:
            _ = squawk.popLast()
        }
    }

    mutating func clear() {
        heading = ""
        altitude = ""
        speed = ""
        frequency = ""
        squawk = ""
        freeNotes = ""
        direction = nil
        vertical = nil
        direct = false
        readback = ""
    }

    private func limited(_ value: String, count: Int, decimalAllowed: Bool) -> String {
        var result = ""
        for character in value {
            if character.isNumber {
                result.append(character)
            } else if decimalAllowed && character == "." && !result.contains(".") {
                result.append(character)
            }
        }
        return String(result.prefix(count))
    }
}

struct ATCScratchpadView: View {
    @Binding var noteText: String
    @Environment(\.dismiss) private var dismiss
    @State private var scratchpad = ATCScratchpadState()

    private let digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "BACKSPACE"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                clearanceSummary
                modeButtons
                actionButtons
                keypad
                disclaimer
            }
            .padding(16)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("ATC Scratchpad")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { commitAndDismiss() }
                }
            }
        }
        .onAppear {
            scratchpad.freeNotes = noteText
        }
    }

    private var clearanceSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Current Clearance")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(scratchpad.summaryLines.isEmpty ? ["Tap a mode, then enter numbers."] : scratchpad.summaryLines, id: \.self) { line in
                    Text(line)
                        .font(.system(.title3, design: .monospaced).weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(red: 0.03, green: 0.08, blue: 0.12))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            if !scratchpad.readback.isEmpty {
                Text(scratchpad.readback)
                    .font(.system(.callout, design: .rounded).weight(.semibold))
                    .foregroundStyle(.yellow)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var modeButtons: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
            ForEach(ATCScratchpadMode.allCases) { mode in
                padButton(mode.rawValue, active: scratchpad.activeMode == mode) {
                    scratchpad.activeMode = mode
                }
            }
        }
    }

    private var actionButtons: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            padButton("LEFT") { scratchpad.direction = .left }
            padButton("RIGHT") { scratchpad.direction = .right }
            padButton("DIRECT") { scratchpad.direct.toggle() }
            padButton("CLIMB") { scratchpad.vertical = .climb }
            padButton("DESCEND") { scratchpad.vertical = .descend }
            padButton("READBACK") { scratchpad.readback = scratchpad.readbackSentence }
            padButton("CLEAR", role: .destructive) { scratchpad.clear() }
            padButton("DONE", active: true) { commitAndDismiss() }
        }
    }

    private var keypad: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(digits, id: \.self) { value in
                padButton(value) {
                    if value == "BACKSPACE" {
                        scratchpad.backspace()
                    } else {
                        scratchpad.append(value)
                    }
                }
            }
        }
    }

    private var disclaimer: some View {
        Text("Situational-awareness scratchpad only. Does not control aircraft systems or authorize navigation.")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.top, 2)
    }

    // Cockpit use favors large hit targets and high contrast over dense form controls.
    private func padButton(
        _ title: String,
        active: Bool = false,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Text(title)
                .font(.system(.title3, design: .rounded).weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .frame(maxWidth: .infinity, minHeight: 54)
        }
        .buttonStyle(.plain)
        .foregroundStyle(active ? .black : .white)
        .background(active ? Color.yellow : Color(red: 0.08, green: 0.13, blue: 0.18))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(active ? Color.yellow : Color(red: 0.25, green: 0.42, blue: 0.52), lineWidth: 1.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func commitAndDismiss() {
        noteText = scratchpad.compactSummary
        dismiss()
    }
}

struct ATCScratchpadView_Previews: PreviewProvider {
    static var previews: some View {
        ATCScratchpadView(noteText: .constant("LEFT HDG 030 / CLIMB ALT 14,000 / SPD 170 KT"))
    }
}
