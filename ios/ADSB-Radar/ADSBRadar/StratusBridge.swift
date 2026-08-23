import Foundation
import Darwin
import CoreLocation

struct StratusAircraft: Codable {
    let hex: String
    let nNumber: String
    let callsign: String
    let type: String
    let lat: Double
    let lon: Double
    let altitude: Int?
    let geoAltitude: Int?
    let speed: Int?
    let track: Int?
    let verticalRate: Int?
    let seen: Double
    let emergency: String?
    let category: String?
    let updatedAt: Double
}

struct StratusOwnship: Codable {
    let source: String
    let supported: Bool
    let stale: Bool
    let ageSeconds: Int?
    let ownship: StratusAircraft?
}

struct StratusAircraftPayload: Codable {
    let source: String
    let stale: Bool
    let ageSeconds: Int?
    let warning: String?
    let listenerStatus: String
    let portStats: [String: Int]
    let aircraft: [StratusAircraft]
    let ac: [StratusAircraft]
    let total: Int
    let ownship: StratusAircraft?
    let packetCount: Int
    let frameCount: Int
    let trafficFrameCount: Int
    let ownshipFrameCount: Int
    let heartbeatFrameCount: Int
    let fisbFrameCount: Int
    let receiverState: String
    let packetsPerSecond: Double
    let framesPerSecond: Double
    let trafficFramesPerSecond: Double
    let lastUdpReceiveAgeSeconds: Double?
    let lastDecodedFrameAgeSeconds: Double?
    let lastTrafficReportAgeSeconds: Double?
    let lastOwnshipReportAgeSeconds: Double?
    let staleReason: String?
    let nativePayloadGeneratedAt: Double
    var deviceHeading: Double?
    var deviceHeadingAccuracy: Double?
    var deviceHeadingAgeSeconds: Double?
    let decodeErrors: Int
}

struct DeviceHeadingPayload: Codable {
    let heading: Double
    let accuracy: Double?
    let magnetic: Bool
    let timestamp: Double
}

final class StratusBridge: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let queue = DispatchQueue(label: "ADSB.StratusBridge")
    private let decoder = GDL90Decoder()
    private let locationManager = CLLocationManager()
    private var sockets: [UInt16: Int32] = [:]
    private var readSources: [UInt16: DispatchSourceRead] = [:]
    private var listenerStates: [UInt16: String] = [:]
    private var portStats: [UInt16: Int] = [:]
    private let ports: [UInt16] = [4000, 4001, 43211]
    private let staleAfter: TimeInterval = 45
    private let degradedAfter: TimeInterval = 20
    private var deviceHeading: Double?
    private var deviceHeadingAccuracy: Double?
    private var lastDeviceHeadingAt: Date?
    private var lastHeadingEventAt = Date.distantPast
    var onDeviceHeadingUpdate: ((DeviceHeadingPayload) -> Void)?

    @Published private(set) var isRunning = false

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.headingFilter = 1
    }

    func start() {
        startDeviceHeading()

        queue.async {
            guard self.sockets.isEmpty else { return }

            for port in self.ports {
                self.startSocket(port: port)
            }

            DispatchQueue.main.async {
                self.isRunning = true
            }
        }
    }

    func aircraftPayload() -> StratusAircraftPayload {
        queue.sync {
            var payload = decoder.aircraftPayload(
                staleAfter: staleAfter,
                degradedAfter: degradedAfter,
                listenerStatus: listenerStatus(),
                portStats: portStats
            )
            payload.deviceHeading = deviceHeading
            payload.deviceHeadingAccuracy = deviceHeadingAccuracy
            payload.deviceHeadingAgeSeconds = lastDeviceHeadingAt.map { Date().timeIntervalSince($0) }
            return payload
        }
    }

    private func startDeviceHeading() {
        DispatchQueue.main.async {
            guard CLLocationManager.headingAvailable() else { return }

            if self.locationManager.authorizationStatus == .notDetermined {
                self.locationManager.requestWhenInUseAuthorization()
            }

            self.locationManager.startUpdatingHeading()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let usesMagnetic = newHeading.trueHeading < 0
        let heading = usesMagnetic ? newHeading.magneticHeading : newHeading.trueHeading
        guard heading >= 0 else { return }
        let normalizedHeading = heading.truncatingRemainder(dividingBy: 360)
        let accuracy = newHeading.headingAccuracy >= 0 ? newHeading.headingAccuracy : nil
        let now = Date()

        queue.async {
            self.deviceHeading = normalizedHeading
            self.deviceHeadingAccuracy = accuracy
            self.lastDeviceHeadingAt = now
            guard now.timeIntervalSince(self.lastHeadingEventAt) >= 0.08 else { return }
            self.lastHeadingEventAt = now
            let payload = DeviceHeadingPayload(
                heading: normalizedHeading,
                accuracy: accuracy,
                magnetic: usesMagnetic,
                timestamp: now.timeIntervalSince1970
            )
            DispatchQueue.main.async {
                self.onDeviceHeadingUpdate?(payload)
            }
        }
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        true
    }

    private func listenerStatus() -> String {
        ports
            .map { port in "\(port): \(listenerStates[port] ?? "not started")" }
            .joined(separator: ", ")
    }

    private func startSocket(port: UInt16) {
        let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard fd >= 0 else {
            listenerStates[port] = "socket failed: \(errnoDescription())"
            return
        }

        var option: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &option, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &option, socklen_t(MemoryLayout<Int32>.size))
#if !os(Linux)
        setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &option, socklen_t(MemoryLayout<Int32>.size))
#endif

        var flags = fcntl(fd, F_GETFL, 0)
        if flags >= 0 {
            flags |= O_NONBLOCK
            _ = fcntl(fd, F_SETFL, flags)
        }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr = in_addr(s_addr: INADDR_ANY.bigEndian)

        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                bind(fd, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        guard bindResult == 0 else {
            listenerStates[port] = "bind failed: \(errnoDescription())"
            close(fd)
            return
        }

        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in
            self?.receiveAvailablePackets(on: fd, port: port)
        }
        source.setCancelHandler {
            close(fd)
        }

        sockets[port] = fd
        readSources[port] = source
        portStats[port] = 0
        listenerStates[port] = "ready"
        source.resume()
    }

    private func receiveAvailablePackets(on fd: Int32, port: UInt16) {
        var buffer = [UInt8](repeating: 0, count: 8192)

        while true {
            var sourceAddress = sockaddr_storage()
            var sourceLength = socklen_t(MemoryLayout<sockaddr_storage>.size)
            let bufferCount = buffer.count
            let byteCount = buffer.withUnsafeMutableBytes { bufferPointer in
                withUnsafeMutablePointer(to: &sourceAddress) { pointer in
                    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                        recvfrom(fd, bufferPointer.baseAddress, bufferCount, 0, sockaddrPointer, &sourceLength)
                    }
                }
            }

            if byteCount > 0 {
                portStats[port, default: 0] += 1
                let packet = Data(buffer.prefix(byteCount))
                decoder.handle(packet: packet, port: port)
                continue
            }

            if byteCount == 0 || errno == EWOULDBLOCK || errno == EAGAIN {
                break
            }

            listenerStates[port] = "recv failed: \(errnoDescription())"
            break
        }
    }

    private func errnoDescription() -> String {
        String(cString: strerror(errno))
    }
}
