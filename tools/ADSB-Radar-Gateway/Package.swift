// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "ADSB-Radar-Gateway",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "ADSB Radar Gateway", targets: ["ADSBRadarGateway"])
    ],
    targets: [
        .executableTarget(
            name: "ADSBRadarGateway",
            path: "Sources/ADSBRadarGateway"
        ),
        .testTarget(
            name: "ADSBRadarGatewayTests",
            dependencies: ["ADSBRadarGateway"],
            path: "Tests/ADSBRadarGatewayTests"
        )
    ]
)
