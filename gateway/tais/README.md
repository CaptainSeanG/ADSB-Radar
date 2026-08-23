# FAA TAIS P50 Gateway

This standalone Java service consumes the approved FAA SWIM/SCDS P50 TAIS `.OUT` queue and exposes a normalized, authenticated HTTP traffic picture for ADSB Radar. It is not part of the iOS binary and does not write to FAA.

FAA states that SCDS data is **not for operational use**.

## Build

```sh
mvn clean test package
```

The shaded executable is `target/tais-gateway.jar`.

Run it with a protected environment file outside the repository:

```sh
scripts/run-tais-gateway.sh "$HOME/Library/Application Support/ADSB Radar TAIS/gateway.env"
```

## Required environment

```text
FAA_TAIS_PROVIDER_URL
FAA_TAIS_QUEUE
FAA_TAIS_CONNECTION_FACTORY
FAA_TAIS_USERNAME
FAA_TAIS_PASSWORD
FAA_TAIS_PASSWORD_FILE       preferred protected password-file path
FAA_TAIS_VPN                  default STDDS
FAA_TAIS_TRUST_STORE          optional path to FAA Jumpstart cacerts
TAIS_GATEWAY_TOKEN            private Worker-to-gateway bearer token
TAIS_GATEWAY_TOKEN_FILE       preferred protected token-file path
TAIS_GATEWAY_PORT             default 8788
TAIS_COVERAGE_CENTER_LAT      default 33.4342
TAIS_COVERAGE_CENTER_LON      default -112.0116
TAIS_COVERAGE_RADIUS_MILES    default 125
```

Keep the environment file outside git with mode `600`. The process binds only to `127.0.0.1`; use an authenticated HTTPS tunnel or reverse proxy for the Cloudflare Worker.

## Endpoints

- `GET /health`
- `GET /api/aircraft?lat=33.45&lon=-112.07&radiusMiles=100`

Both require `Authorization: Bearer <TAIS_GATEWAY_TOKEN>`.

The health response includes queue state, last-message age, JMS and normalized-position rates, active tracks, parser/reconnect counters, and rolling median/p95 per-track update intervals. No FAA credential is returned or logged.

## P50 beta gate

The initial beta gate is a configurable 125-mile circle centered near KPHX. This is deliberately documented as an application gate, not an assertion of the official P50 airspace boundary. Requests outside the gate fall through to the existing Internet ADS-B providers.

Tracks expire 30 seconds after their FAA observation timestamp. ICAO is preferred for identity, followed by GUFI, then `facility + terminal track + generation`. Repeated source timestamps are ignored, and terminal-track generation changes on lifecycle gaps, beacon/callsign changes, or implausible jumps.

`vx` and `vy` are retained internally. They are not exposed as groundspeed/course because their authoritative TAIS units have not been confirmed.

## Worker integration

The existing `adsb-radar-proxy` Worker expects two encrypted secrets:

```text
TAIS_GATEWAY_URL
TAIS_GATEWAY_TOKEN
```

Inside the documented P50 beta gate, a genuinely live gateway response is preferred. A connecting, stale, unavailable, unconfigured, or out-of-gate result falls through to the existing Internet ADS-B fast cache, provider, and KV durable-fallback path.

The macOS process and HTTPS tunnel must remain available for the initial TestFlight beta. A temporary quick-tunnel URL is suitable for the 15-minute integration proof, but a stable hosted gateway/tunnel hostname is required before wider distribution.
