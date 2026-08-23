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
    private var lastPacketAt: Date?
    private var lastFrameAt: Date?
    private var lastTrafficReportAt: Date?
    private var lastOwnshipReportAt: Date?
    private var packetTimestamps: [Date] = []
    private var frameTimestamps: [Date] = []
    private var trafficFrameTimestamps: [Date] = []
    private var pendingFrameBytes: [UInt8] = []
    private var frameOpen = false

    func handle(packet: Data, port: UInt16) {
        packetCount += 1
        let now = Date()
        lastPacketAt = now
        packetTimestamps.append(now)
        packetTimestamps = packetTimestamps.filter { now.timeIntervalSince($0) <= 10 }
        parse(packet: [UInt8](packet))
    }

    func aircraftPayload(staleAfter: TimeInterval, degradedAfter: TimeInterval, listenerStatus: String, portStats: [UInt16: Int]) -> StratusAircraftPayload {
        pruneTraffic(maxAge: 90)

        let now = Date()
        let aircraft = traffic.values.map { $0.payload(now: now) }
        let feedTimestamp = lastFrameAt ?? lastPacketAt
        let ageSeconds = feedTimestamp.map { Int(now.timeIntervalSince($0).rounded()) }
        let frameAge = lastFrameAt.map { now.timeIntervalSince($0) }
        let packetAge = lastPacketAt.map { now.timeIntervalSince($0) }
        let trafficAge = lastTrafficReportAt.map { now.timeIntervalSince($0) }
        let ownshipAge = lastOwnshipReportAt.map { now.timeIntervalSince($0) }
        let stale = frameAge.map { $0 > staleAfter } ?? true
        let receiverState: String
        let staleReason: String?
        if lastPacketAt == nil {
            receiverState = "connecting"
            staleReason = "No UDP datagrams have been received yet."
        } else if stale {
            receiverState = "stale"
            staleReason = frameAge.map { "Last decoded GDL90 frame was \(Int($0.rounded())) seconds ago." } ?? "UDP datagrams are arriving, but no valid GDL90 frames have decoded yet."
        } else if (frameAge ?? 0) > degradedAfter || trafficAge.map({ $0 > degradedAfter }) == true {
            receiverState = "degraded"
            staleReason = "GDL90 cadence is slower than expected."
        } else {
            receiverState = "live"
            staleReason = nil
        }
        let ownshipPayload = ownship?.payload(now: now)
        let portStatsPayload = Dictionary(uniqueKeysWithValues: portStats.map { (String($0.key), $0.value) })
        let packetsPerSecond = packetTimestamps.isEmpty ? 0 : Double(packetTimestamps.count) / 10.0
        let framesPerSecond = frameTimestamps.isEmpty ? 0 : Double(frameTimestamps.count) / 10.0
        let trafficFramesPerSecond = trafficFrameTimestamps.isEmpty ? 0 : Double(trafficFrameTimestamps.count) / 10.0

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
            receiverState: receiverState,
            packetsPerSecond: packetsPerSecond,
            framesPerSecond: framesPerSecond,
            trafficFramesPerSecond: trafficFramesPerSecond,
            lastUdpReceiveAgeSeconds: packetAge,
            lastDecodedFrameAgeSeconds: frameAge,
            lastTrafficReportAgeSeconds: trafficAge,
            lastOwnshipReportAgeSeconds: ownshipAge,
            staleReason: staleReason,
            nativePayloadGeneratedAt: now.timeIntervalSince1970,
            deviceHeading: nil,
            deviceHeadingAccuracy: nil,
            deviceHeadingAgeSeconds: nil,
            decodeErrors: decodeErrors
        )
    }

    private func parse(packet: [UInt8]) {
        for byte in packet {
            if byte == 0x7e {
                if frameOpen && !pendingFrameBytes.isEmpty {
                    decodeRawFrame(pendingFrameBytes)
                }
                pendingFrameBytes.removeAll(keepingCapacity: true)
                frameOpen = true
                continue
            }

            guard frameOpen else { continue }
            pendingFrameBytes.append(byte)
            if pendingFrameBytes.count > 4096 {
                pendingFrameBytes.removeAll(keepingCapacity: true)
                frameOpen = false
                decodeErrors += 1
            }
        }
    }

    private func decodeRawFrame(_ rawFrame: [UInt8]) {
        do {
            let frame = try unescape(rawFrame)
            let payload = frame.count > 2 ? Array(frame.dropLast(2)) : frame
            let now = Date()
            frameCount += 1
            lastFrameAt = now
            frameTimestamps.append(now)
            frameTimestamps = frameTimestamps.filter { now.timeIntervalSince($0) <= 10 }
            decode(frame: payload)
        } catch {
            decodeErrors += 1
        }
    }

    private func decode(frame: [UInt8]) {
        guard let messageId = frame.first else { return }

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
                lastOwnshipReportAt = Date()
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
                let now = Date()
                lastTrafficReportAt = now
                trafficFrameTimestamps.append(now)
                trafficFrameTimestamps = trafficFrameTimestamps.filter { now.timeIntervalSince($0) <= 10 }
            }
        default:
            return
        }
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
