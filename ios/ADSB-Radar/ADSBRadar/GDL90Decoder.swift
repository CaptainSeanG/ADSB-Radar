import Foundation

final class GDL90Decoder {
    private var traffic: [String: DecodedAircraft] = [:]
    private var ownship: DecodedAircraft?
    private var ownshipGeoAltitude: Int?
    private(set) var packetCount = 0
    private(set) var frameCount = 0
    private(set) var trafficFrameCount = 0
    private(set) var ownshipFrameCount = 0
    private(set) var heartbeatFrameCount = 0
    private(set) var fisbFrameCount = 0
    private(set) var decodeErrors = 0
    private var messageCounts: [UInt8: Int] = [:]
    private var vendorFrameSamples: [UInt8: String] = [:]
    private var vendorAsciiSamples: [UInt8: String] = [:]
    private var rawPacketSamples: [UInt16: String] = [:]
    private var rawPacketTailSamples: [UInt16: String] = [:]
    private var rawPacketAsciiSamples: [UInt16: String] = [:]
    private var rawPacketLengths: [UInt16: Int] = [:]
    private var frameSamples: [UInt8: String] = [:]
    private var frameLengths: [UInt8: Int] = [:]
    private var recentMessageIds: [UInt8] = []
    private var batteryCandidates: [String: String] = [:]
    private var batteryPercent: Int?
    private var powerStatus: String?
    private var lastPacketAt: Date?

    func handle(packet: Data, port: UInt16) {
        packetCount += 1
        lastPacketAt = Date()
        captureRawPacketSample(packet, port: port)
        parse(packet: [UInt8](packet))
    }

    func aircraftPayload(staleAfter: TimeInterval, listenerStatus: String, portStats: [UInt16: Int]) -> StratusAircraftPayload {
        pruneTraffic(maxAge: 90)

        let now = Date()
        let aircraft = traffic.values.map { $0.payload(now: now) }
        let ageSeconds = lastPacketAt.map { Int(now.timeIntervalSince($0).rounded()) }
        let stale = lastPacketAt.map { now.timeIntervalSince($0) > staleAfter } ?? true
        let ownshipPayload = ownship?.payload(now: now)
        let portStatsPayload = Dictionary(uniqueKeysWithValues: portStats.map { (String($0.key), $0.value) })

        return StratusAircraftPayload(
            source: "Stratus",
            stale: stale,
            ageSeconds: ageSeconds,
            warning: stale ? "Native receiver waiting for Stratus packets. Listeners: \(listenerStatus). Packets: \(packetCount), frames: \(frameCount), traffic frames: \(trafficFrameCount)." : nil,
            listenerStatus: listenerStatus,
            portStats: portStatsPayload,
            aircraft: aircraft,
            ac: aircraft,
            total: aircraft.count,
            ownship: ownshipPayload,
            packetCount: packetCount,
            frameCount: frameCount,
            trafficFrameCount: trafficFrameCount,
            ownshipFrameCount: ownshipFrameCount,
            heartbeatFrameCount: heartbeatFrameCount,
            fisbFrameCount: fisbFrameCount,
            batteryPercent: batteryPercent,
            powerStatus: powerStatus,
            deviceHeading: nil,
            deviceHeadingAccuracy: nil,
            deviceHeadingAgeSeconds: nil,
            messageCounts: Dictionary(uniqueKeysWithValues: messageCounts.map { (String($0.key), $0.value) }),
            vendorFrameSamples: Dictionary(uniqueKeysWithValues: vendorFrameSamples.map { (String($0.key), $0.value) }),
            vendorAsciiSamples: Dictionary(uniqueKeysWithValues: vendorAsciiSamples.map { (String($0.key), $0.value) }),
            rawPacketSamples: Dictionary(uniqueKeysWithValues: rawPacketSamples.map { (String($0.key), $0.value) }),
            rawPacketTailSamples: Dictionary(uniqueKeysWithValues: rawPacketTailSamples.map { (String($0.key), $0.value) }),
            rawPacketAsciiSamples: Dictionary(uniqueKeysWithValues: rawPacketAsciiSamples.map { (String($0.key), $0.value) }),
            rawPacketLengths: Dictionary(uniqueKeysWithValues: rawPacketLengths.map { (String($0.key), $0.value) }),
            frameSamples: Dictionary(uniqueKeysWithValues: frameSamples.map { (String($0.key), $0.value) }),
            frameLengths: Dictionary(uniqueKeysWithValues: frameLengths.map { (String($0.key), $0.value) }),
            recentMessageIds: recentMessageIds.map { Int($0) },
            batteryCandidates: batteryCandidates,
            decodeErrors: decodeErrors
        )
    }

    private func captureRawPacketSample(_ packet: Data, port: UInt16) {
        rawPacketLengths[port] = packet.count
        let bytes = [UInt8](packet.prefix(96))
        guard !bytes.isEmpty else { return }
        rawPacketSamples[port] = bytes
            .map { String(format: "%02X", $0) }
            .joined()
        rawPacketTailSamples[port] = packet
            .suffix(96)
            .map { String(format: "%02X", $0) }
            .joined()
        rawPacketAsciiSamples[port] = bytes
            .map { byte in byte >= 0x20 && byte <= 0x7e ? String(UnicodeScalar(byte)) : "." }
            .joined()
        captureBatteryCandidates(bytes: [UInt8](packet.prefix(512)), label: "pkt\(port)")
    }

    private func parse(packet: [UInt8]) {
        var start: Int?

        for index in packet.indices {
            guard packet[index] == 0x7e else { continue }

            if let frameStart = start, index > frameStart + 1 {
                let rawFrame = Array(packet[(frameStart + 1)..<index])
                do {
                    let frame = try unescape(rawFrame)
                    let payload = frame.count > 2 ? Array(frame.dropLast(2)) : frame
                    frameCount += 1
                    decode(frame: payload)
                } catch {
                    decodeErrors += 1
                }
            }

            start = index
        }
    }

    private func decode(frame: [UInt8]) {
        guard let messageId = frame.first else { return }
        messageCounts[messageId, default: 0] += 1
        captureFrameSample(frame)

        switch messageId {
        case 0:
            heartbeatFrameCount += 1
        case 7:
            fisbFrameCount += 1
        case 10:
            if let report = decodeTrafficReport(frame: frame) {
                var ownshipReport = report
                ownshipReport.geoAltitude = ownshipGeoAltitude
                ownship = ownshipReport
                ownshipFrameCount += 1
            }
        case 11:
            if let altitude = decodeOwnshipGeoAltitude(frame: frame) {
                ownshipGeoAltitude = altitude
                if var currentOwnship = ownship {
                    currentOwnship.geoAltitude = altitude
                    ownship = currentOwnship
                }
            }
        case 20:
            if let report = decodeTrafficReport(frame: frame) {
                traffic[report.key] = report
                trafficFrameCount += 1
            }
        default:
            captureVendorFrameSample(frame)
            return
        }
    }

    private func captureFrameSample(_ frame: [UInt8]) {
        guard let messageId = frame.first else { return }
        recentMessageIds.append(messageId)
        if recentMessageIds.count > 24 {
            recentMessageIds.removeFirst(recentMessageIds.count - 24)
        }
        frameSamples[messageId] = frame
            .prefix(64)
            .map { String(format: "%02X", $0) }
            .joined()
        frameLengths[messageId] = frame.count
        captureBatteryCandidates(bytes: frame, label: "msg\(messageId)")
    }

    private func captureVendorFrameSample(_ frame: [UInt8]) {
        guard let messageId = frame.first else { return }
        guard messageId >= 0x40 || ![0, 7, 10, 11, 20].contains(messageId) else { return }

        let sample = frame
            .prefix(32)
            .map { String(format: "%02X", $0) }
            .joined()
        vendorFrameSamples[messageId] = sample
        vendorAsciiSamples[messageId] = asciiSnippet(frame)
    }

    private func captureBatteryCandidates(bytes: [UInt8], label: String) {
        guard !bytes.isEmpty else { return }

        let lowercaseAscii = String(bytes: bytes.map { $0 >= 0x20 && $0 <= 0x7e ? $0 : 0x20 }, encoding: .ascii)?.lowercased() ?? ""
        if lowercaseAscii.contains("bat") || lowercaseAscii.contains("batt") || lowercaseAscii.contains("battery") || lowercaseAscii.contains("pwr") {
            batteryCandidates["\(label)-ascii"] = asciiSnippet(bytes)
        }

        for (index, byte) in bytes.enumerated() where byte <= 100 {
            let previous = index > 0 ? bytes[index - 1] : 0
            let next = index + 1 < bytes.count ? bytes[index + 1] : 0
            if previous == 0 || next == 0 || (byte >= 5 && byte <= 100) {
                batteryCandidates["\(label)-pct\(index)"] = "\(byte)"
                if batteryCandidates.count > 32 { return }
            }
        }
    }

    private func asciiSnippet(_ bytes: [UInt8]) -> String {
        String(bytes: bytes.prefix(80).map { byte in
            byte >= 0x20 && byte <= 0x7e ? byte : 0x2e
        }, encoding: .ascii)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func decodeTrafficReport(frame: [UInt8]) -> DecodedAircraft? {
        guard frame.count >= 27 else { return nil }

        let hex = frame[2...4].map { String(format: "%02X", $0) }.joined()
        let lat = decodeCoordinate(frame, offset: 5)
        let lon = decodeCoordinate(frame, offset: 8)
        let rawAltitude = (Int(frame[11]) << 4 | Int(frame[12]) >> 4) & 0x0fff
        let altitude = rawAltitude == 0x0fff ? nil : rawAltitude * 25 - 1000
        let rawSpeed = (Int(frame[14]) << 4 | Int(frame[15]) >> 4) & 0x0fff
        let speed = rawSpeed == 0x0fff ? nil : rawSpeed
        let verticalRateRaw = (Int(frame[15] & 0x0f) << 8) | Int(frame[16])
        let verticalRate = verticalRateRaw == 0x0800 ? nil : signed12(verticalRateRaw) * 64
        let track = Int((Double(frame[17]) * 360.0 / 256.0).rounded())
        let callsign = decodeCallsign(frame, offset: 19, length: 8)

        guard lat.isFinite, lon.isFinite, abs(lat) <= 90, abs(lon) <= 180 else {
            return nil
        }

        return DecodedAircraft(
            key: hex.isEmpty ? "\(lat),\(lon)" : hex,
            hex: hex,
            callsign: callsign,
            lat: lat,
            lon: lon,
            altitude: altitude,
            geoAltitude: nil,
            speed: speed,
            track: track,
            verticalRate: verticalRate,
            updatedAt: Date()
        )
    }

    private func decodeOwnshipGeoAltitude(frame: [UInt8]) -> Int? {
        guard frame.count >= 4 else { return nil }
        let rawAltitude = Int(frame[1]) << 8 | Int(frame[2])
        return rawAltitude == 0xffff ? nil : rawAltitude * 5 - 1000
    }

    private func pruneTraffic(maxAge: TimeInterval) {
        let now = Date()
        traffic = traffic.filter { now.timeIntervalSince($0.value.updatedAt) <= maxAge }
    }

    private func unescape(_ frame: [UInt8]) throws -> [UInt8] {
        var bytes: [UInt8] = []
        var index = 0

        while index < frame.count {
            let byte = frame[index]
            if byte == 0x7d {
                guard index + 1 < frame.count else { throw DecodeError.invalidEscape }
                bytes.append(frame[index + 1] ^ 0x20)
                index += 2
            } else {
                bytes.append(byte)
                index += 1
            }
        }

        return bytes
    }

    private func signed24(_ frame: [UInt8], offset: Int) -> Int {
        var value = Int(frame[offset]) << 16 | Int(frame[offset + 1]) << 8 | Int(frame[offset + 2])
        if value & 0x800000 != 0 {
            value -= 0x1000000
        }
        return value
    }

    private func decodeCoordinate(_ frame: [UInt8], offset: Int) -> Double {
        Double(signed24(frame, offset: offset)) * 180.0 / Double(0x800000)
    }

    private func signed12(_ value: Int) -> Int {
        value & 0x0800 != 0 ? value - 0x1000 : value
    }

    private func decodeCallsign(_ frame: [UInt8], offset: Int, length: Int) -> String {
        guard offset + length <= frame.count else { return "" }
        let bytes = frame[offset..<(offset + length)].filter { $0 >= 0x20 && $0 <= 0x7e }
        return String(bytes: bytes, encoding: .ascii)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private enum DecodeError: Error {
        case invalidEscape
    }
}

private struct DecodedAircraft {
    let key: String
    let hex: String
    let callsign: String
    let lat: Double
    let lon: Double
    let altitude: Int?
    var geoAltitude: Int?
    let speed: Int?
    let track: Int?
    let verticalRate: Int?
    let updatedAt: Date

    func payload(now: Date) -> StratusAircraft {
        StratusAircraft(
            hex: hex,
            nNumber: "",
            callsign: callsign,
            type: "",
            lat: lat,
            lon: lon,
            altitude: altitude,
            geoAltitude: geoAltitude,
            speed: speed,
            track: track,
            verticalRate: verticalRate,
            seen: max(0, now.timeIntervalSince(updatedAt)),
            emergency: nil,
            category: nil,
            updatedAt: updatedAt.timeIntervalSince1970 * 1000
        )
    }
}
