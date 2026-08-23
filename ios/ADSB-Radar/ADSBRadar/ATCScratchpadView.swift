import SwiftUI
import Foundation

enum ATCScratchpadMode: String, CaseIterable, Identifiable {
    case heading = "HDG"
    case altitude = "ALT"
    case speed = "SPD"
    case frequency = "FREQ"
    case squawk = "SQK"
    case direct = "DCT"

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
    var directRoute = ""
    var direction: ATCScratchpadDirection?
    var vertical: ATCScratchpadVertical?
    var direct = false
    var readback = ""
    var completedModes: Set<ATCScratchpadMode> = []

    var compactSummary: String {
        let lines = summaryLines
        return lines.isEmpty ? "ATC scratchpad empty" : lines.joined(separator: " / ")
    }

    var summaryLines: [String] {
        var lines: [String] = []
        if let heading = formattedHeadingLine {
            lines.append(heading)
        }
        if let altitude = formattedAltitudeLine {
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
        return lines
    }

    var stripRows: [(mode: ATCScratchpadMode, label: String, value: String?)] {
        [
            (.heading, "Heading", formattedHeadingLine),
            (.altitude, "Altitude", formattedAltitudeLine),
            (.speed, "Speed", formattedSpeed),
            (.frequency, "Frequency", formattedFrequency),
            (.squawk, "Squawk", formattedSquawk)
        ]
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
        return phrases.isEmpty ? "No clearance entered." : phrases.joined(separator: ", ") + "."
    }

    var formattedHeading: String? {
        let digits = heading.filter(\.isNumber)
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        return "HDG \(String(format: "%03d", min(max(value, 0), 360)))"
    }

    var formattedHeadingLine: String? {
        guard let heading = formattedHeading else { return nil }
        guard let direction else { return heading }
        return "\(direction.rawValue) \(heading)"
    }

    var formattedAltitude: String? {
        let digits = altitude.filter(\.isNumber)
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return "ALT \(formatter.string(from: NSNumber(value: value)) ?? "\(value)")"
    }

    var formattedAltitudeLine: String? {
        guard let altitude = formattedAltitude else { return nil }
        guard let vertical else { return altitude }
        let prefix = vertical == .descend ? "DESC" : vertical.rawValue
        return "\(prefix) \(altitude)"
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

    var formattedDirect: String? {
        let route = directRoute
            .uppercased()
            .filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard direct || !route.isEmpty else { return nil }
        return route.isEmpty ? "DCT" : "DCT \(route)"
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
        case .direct:
            direct = true
            directRoute = routeLimited(directRoute + value)
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
        case .direct:
            _ = directRoute.popLast()
        }
    }

    mutating func clear() {
        heading = ""
        altitude = ""
        speed = ""
        frequency = ""
        squawk = ""
        directRoute = ""
        direction = nil
        vertical = nil
        direct = false
        readback = ""
        completedModes = []
    }

    mutating func clearActiveField() {
        switch activeMode {
        case .heading:
            heading = ""
            direction = nil
        case .altitude:
            altitude = ""
            vertical = nil
        case .speed:
            speed = ""
        case .frequency:
            frequency = ""
        case .squawk:
            squawk = ""
        case .direct:
            directRoute = ""
            direct = false
        }
        completedModes.remove(activeMode)
    }

    mutating func clearActiveNumericValue() {
        switch activeMode {
        case .heading:
            heading = ""
        case .altitude:
            altitude = ""
        case .speed:
            speed = ""
        case .frequency:
            frequency = ""
        case .squawk:
            squawk = ""
        case .direct:
            directRoute = ""
        }
        completedModes.remove(activeMode)
    }

    mutating func select(_ mode: ATCScratchpadMode) {
        activeMode = mode
        if mode == .direct {
            direct = true
        }
    }

    mutating func toggleCompleted(_ mode: ATCScratchpadMode) {
        if completedModes.contains(mode) {
            completedModes.remove(mode)
        } else {
            completedModes.insert(mode)
        }
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

    private func routeLimited(_ value: String) -> String {
        let cleaned = value.uppercased().filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }
        return String(cleaned.prefix(12))
    }
}

struct ATCScratchpadView: View {
    @Binding var noteText: String
    @Binding var scratchpad: ATCScratchpadState
    var onDismiss: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var clearAllArmed = false
    @State private var replaceArmedMode: ATCScratchpadMode?
    @State private var selectedRowAt: Date?

    private let digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "BACKSPACE"]
    private let subtleTextColor = Color.white.opacity(0.68)
    private let replaceWindow: TimeInterval = 3

    var body: some View {
        VStack(spacing: 9) {
            clearanceStrip
            keypad
            actionButtons
            disclaimer
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(red: 0.25, green: 0.42, blue: 0.52), lineWidth: 1.5)
        )
        .shadow(color: .black.opacity(0.55), radius: 24, x: 0, y: 18)
    }

    private var clearanceStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("IFR Clearance Strip")
                .font(.caption.weight(.bold))
                .foregroundStyle(subtleTextColor)
                .textCase(.uppercase)

            VStack(spacing: 8) {
                ForEach(scratchpad.stripRows, id: \.mode) { row in
                    stripRow(mode: row.mode, label: row.label, value: row.value)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 244, alignment: .center)

            if !scratchpad.readback.isEmpty {
                Text(scratchpad.readback)
                    .font(.system(.callout, design: .rounded).weight(.semibold))
                    .foregroundStyle(.yellow)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 16)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, minHeight: 292, alignment: .top)
        .background(Color(red: 0.03, green: 0.08, blue: 0.12))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func stripRow(mode: ATCScratchpadMode, label: String, value: String?) -> some View {
        let isActive = scratchpad.activeMode == mode
        let isCompleted = scratchpad.completedModes.contains(mode)
        let populated = value != nil

        return HStack(spacing: 10) {
            Button {
                if populated {
                    scratchpad.toggleCompleted(mode)
                }
            } label: {
                Text(isCompleted ? "✓" : "")
                    .font(.system(.body, design: .rounded).weight(.black))
                    .frame(width: 22, height: 34)
                    .foregroundStyle(.green)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(label.uppercased())
                        .font(.system(.caption, design: .rounded).weight(.black))
                        .foregroundStyle(isActive ? .black : .secondary)
                        .frame(width: 82, alignment: .leading)

                    rowControls(for: mode)
                    Spacer(minLength: 0)
                }

                Text(value ?? "--")
                    .font(.system(.title3, design: .monospaced).weight(.black))
                    .foregroundStyle(isActive ? .black : isCompleted ? .secondary : .white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, minHeight: 42)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            selectForEditing(mode)
        }
        .background(isActive ? Color.yellow : Color(red: 0.07, green: 0.12, blue: 0.17).opacity(isCompleted ? 0.48 : 1))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isActive ? Color.yellow : Color(red: 0.22, green: 0.34, blue: 0.42), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .opacity(isCompleted && !isActive ? 0.68 : 1)
    }

    @ViewBuilder
    private func rowControls(for mode: ATCScratchpadMode) -> some View {
        switch mode {
        case .heading:
            HStack(spacing: 5) {
                inlineOption("LEFT", active: scratchpad.direction == .left) {
                    scratchpad.direction = .left
                    selectForEditing(.heading)
                }
                inlineOption("RIGHT", active: scratchpad.direction == .right) {
                    scratchpad.direction = .right
                    selectForEditing(.heading)
                }
            }
        case .altitude:
            HStack(spacing: 5) {
                inlineOption("CLIMB", active: scratchpad.vertical == .climb) {
                    scratchpad.vertical = .climb
                    selectForEditing(.altitude)
                }
                inlineOption("DESC", active: scratchpad.vertical == .descend) {
                    scratchpad.vertical = .descend
                    selectForEditing(.altitude)
                }
            }
        default:
            EmptyView()
        }
    }

    private func inlineOption(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(.caption2, design: .rounded).weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.horizontal, 8)
                .frame(minHeight: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(active ? .black : .white)
        .background(active ? Color.yellow : Color.black.opacity(0.28))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(active ? Color.yellow : Color(red: 0.25, green: 0.42, blue: 0.52), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            padButton("READBACK") { scratchpad.readback = scratchpad.readbackSentence }
            clearButton
            padButton("DONE", active: true) { commitAndDismiss() }
        }
        .frame(maxWidth: 430)
    }

    private var keypad: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(digits, id: \.self) { value in
                padButton(value) {
                    handleKey(value)
                }
            }
        }
        .frame(maxWidth: 430)
    }

    private var disclaimer: some View {
        Text("Situational-awareness scratchpad only. Does not control aircraft systems or authorize navigation.")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(subtleTextColor)
            .multilineTextAlignment(.center)
            .padding(.top, 1)
    }

    private var clearButton: some View {
        Text(clearAllArmed ? "FULL CLR" : "CLEAR")
            .font(.system(.body, design: .rounded).weight(.black))
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
            .foregroundStyle(clearAllArmed ? .black : .white)
            .background(clearAllArmed ? Color.orange : Color(red: 0.08, green: 0.13, blue: 0.18))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(clearAllArmed ? Color.orange : Color(red: 0.25, green: 0.42, blue: 0.52), lineWidth: 1.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .onTapGesture {
                scratchpad.clearActiveField()
                replaceArmedMode = nil
            }
            .onLongPressGesture(minimumDuration: 2, maximumDistance: 36) {
                scratchpad.clear()
                replaceArmedMode = nil
                withAnimation(.easeOut(duration: 0.12)) {
                    clearAllArmed = false
                }
            } onPressingChanged: { pressing in
                withAnimation(.easeOut(duration: 0.12)) {
                    clearAllArmed = pressing
                }
            }
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
                .font(.system(.body, design: .rounded).weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
        .foregroundStyle(active ? .black : .white)
        .background(active ? Color.yellow : Color(red: 0.08, green: 0.13, blue: 0.18))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(active ? Color.yellow : Color(red: 0.25, green: 0.42, blue: 0.52), lineWidth: 1.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func selectForEditing(_ mode: ATCScratchpadMode) {
        scratchpad.select(mode)
        replaceArmedMode = mode
        selectedRowAt = Date()
    }

    private func handleKey(_ value: String) {
        if value == "BACKSPACE" {
            scratchpad.backspace()
            replaceArmedMode = nil
            return
        }

        if replaceArmedMode == scratchpad.activeMode,
           let selectedRowAt,
           Date().timeIntervalSince(selectedRowAt) <= replaceWindow {
            scratchpad.clearActiveNumericValue()
        }

        scratchpad.append(value)
        replaceArmedMode = nil
    }

    private func commitAndDismiss() {
        noteText = scratchpad.compactSummary
        if let onDismiss {
            onDismiss()
        } else {
            dismiss()
        }
    }
}

struct ATCScratchpadView_Previews: PreviewProvider {
    static var previews: some View {
        ATCScratchpadView(
            noteText: .constant("LEFT HDG 030 / CLIMB ALT 14,000 / SPD 170 KT"),
            scratchpad: .constant(ATCScratchpadState())
        )
    }
}
