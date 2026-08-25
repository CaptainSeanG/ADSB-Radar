# ADSB Radar Gateway Monitor

`ADSB Radar Gateway` is a native SwiftUI macOS operations panel for the FAA TAIS gateway, its Cloudflare tunnel, the production ADSB Radar Worker, and anonymous active-client counts.

The app lives under `tools/ADSB-Radar-Gateway` and is independent of the iOS target.

## Current Production Baseline

The Mac runs these exact launchd jobs:

- `com.captainseang.adsbradar.tais-gateway`
  - `/Users/seangallagher/ADSB-Radar/scripts/run-tais-gateway.sh`
  - protected environment: `~/Library/Application Support/ADSB Radar Gateway/gateway.env`
  - local endpoint: `http://127.0.0.1:8788`
- `com.captainseang.adsbradar.tais-tunnel`
  - named tunnel: `adsb-radar-tais`
  - configuration: `~/.cloudflared/adsb-radar-tais.yml`
  - public hostname: `https://tais.adsbradar.net`
  - local target: `http://127.0.0.1:8788`

The permanent hostname does not change when cloudflared, the Gateway app, or the Mac restarts. The production Worker's encrypted `TAIS_GATEWAY_URL` is `https://tais.adsbradar.net`; the matching bearer token remains a separate encrypted Worker secret.

## Build and Run

```sh
cd /Users/seangallagher/ADSB-Radar/tools/ADSB-Radar-Gateway
swift test
scripts/build-app.sh
open ".build/ADSB Radar Gateway.app"
```

The packaged app is ad-hoc signed for local use. It is not an App Store product.

For the normal permanent installation, build and install the canonical app in
`/Applications`, then create a Desktop symlink without duplicating the bundle:

```sh
cd /Users/seangallagher/ADSB-Radar/tools/ADSB-Radar-Gateway
scripts/install-app.sh
```

This produces:

- `/Applications/ADSB Radar Gateway.app`
- `~/Desktop/ADSB Radar Gateway` -> `/Applications/ADSB Radar Gateway.app`

LaunchServices and `LSMultipleInstancesProhibited` keep Finder, Spotlight,
Applications, Dock, and Desktop launches attached to one app process. Reopening
the app restores and fronts its single dashboard window.

The app remains alive when its dashboard window closes and exposes a persistent
radar status item in the macOS menu bar. The icon is green when the gateway,
FAA queue, tunnel, Worker, and Worker TAIS selection are all live; orange while
connecting or temporarily stale; red when a required process or connection has
failed; and gray when service definitions are not installed. The menu restores
the existing dashboard and does not create another window.

The same non-disruptive service-definition installation available in the GUI can be run from Terminal:

```sh
".build/ADSB Radar Gateway.app/Contents/MacOS/ADSB Radar Gateway" --install-service-definitions
```

## Protected Tokens

The app never reads FAA usernames or passwords. It uses two narrowly scoped bearer tokens from macOS Keychain:

- `tais-gateway-token`: localhost and tunnel health requests
- `worker-admin-token`: protected aggregate user metrics

Store a token from a mode-600 file without printing it:

```sh
tools/ADSB-Radar-Gateway/scripts/configure-keychain.sh tais-gateway-token /path/to/tais-token-file
tools/ADSB-Radar-Gateway/scripts/configure-keychain.sh worker-admin-token /path/to/admin-token-file
```

Keychain service: `com.captainseang.adsbradar.gateway-monitor`.

The FAA password, TAIS bearer token, Cloudflare secrets, and Worker admin token are never displayed by the app or written to its logs.

## Service Definitions

The app can install persistent per-user LaunchAgent property lists at:

- `~/Library/LaunchAgents/com.captainseang.adsbradar.tais-gateway.plist`
- `~/Library/LaunchAgents/com.captainseang.adsbradar.tais-tunnel.plist`

Installation copies the existing protected gateway environment to:

`~/Library/Application Support/ADSB Radar Gateway/gateway.env`

with mode `600`. Merely installing the definitions does not stop or replace currently running processes.

The controls target the exact launchd labels. They never use `pkill`, `killall`, or a generic Java/cloudflared process match.

- Start: `launchctl bootstrap` followed by label-specific `kickstart`
- Stop: label-specific `launchctl bootout`
- Restart: label-specific `launchctl kickstart -k`

The native monitor refreshes dashboard telemetry every 15 seconds. Opening the
dashboard, selecting Refresh, or performing a service action requests an
immediate refresh. This interval affects only the monitor UI; the Java FAA TAIS
gateway continues consuming JMS messages continuously.

Combined Start/Stop/Restart controls are enabled only after the monitor recognizes
the installed connector as `Permanent Named Tunnel`. Each action targets only the
two exact ADSB Radar LaunchAgent labels.

Stop is disabled until the persistent definitions are installed, ensuring the app cannot remove a dynamically submitted service that it cannot restore.

## Start at Login

The two login toggles update `RunAtLoad` and the matching `KeepAlive` policy in the dedicated LaunchAgent files. Both default to enabled, matching the current always-on production behavior. The gateway can run without the tunnel. A tunnel without a healthy local gateway is shown as degraded.

Combined Start/Stop/Restart controls remain disabled until the permanent named tunnel is recognized as connected.

## Gateway Telemetry

The authenticated localhost `/health` response includes:

- gateway version and process uptime
- FAA JMS and queue connection state
- last FAA message timestamp and age
- JMS messages/second
- normalized position updates/second
- active tracks
- parser errors
- reconnect count

The endpoint binds to `127.0.0.1` and returns no credentials.

## Tunnel Telemetry

The app combines exact launchd state with cloudflared's bounded recent log:

- PID and uptime
- permanent named-tunnel mode
- fixed public URL (`https://tais.adsbradar.net`)
- local target
- registration time
- authenticated remote health latency when the TAIS token is configured

Logs are read from `~/Library/Application Support/ADSB Radar Gateway`, falling back to the existing `/private/tmp` tunnel log only for migration diagnostics. The parser selects the newest tunnel mode so historical quick-tunnel URLs cannot override the active named connector.

## Worker and Anonymous Client Telemetry

Each ADSB Radar installation creates one random opaque UUID in local storage and sends it only on Worker traffic requests in `X-ADSB-Radar-Client`. It contains no user, Apple ID, email, serial number, advertising ID, or location data.

A single global Cloudflare Durable Object stores at most:

- opaque client ID
- last seen timestamp
- app rollout/build string
- source classification observed on the request

Records expire from the active set after one hour. The object persists a compact snapshot at most every 30 seconds rather than writing on every traffic poll. It does not retain location history or raw request history.

`Active Now` means unique anonymous IDs observed in the last two minutes. The protected metrics also report unique clients in 15 minutes and one hour, current-minute requests, and observed source classifications. A Stratus-only client that does not contact the Worker is not guessed or counted.

The Worker endpoint is:

`GET /admin/metrics`

and requires `Authorization: Bearer <ADSB_ADMIN_TOKEN>`. It returns aggregate counts only, never client IDs.

### Cloudflare Configuration

The local `wrangler.toml` defines:

- Durable Object binding: `ACTIVE_CLIENTS`
- class: `ActiveClientTelemetry`
- SQLite migration: `v1-active-client-telemetry`

Before deploying, create a strong protected token and configure:

```sh
npx wrangler secret put ADSB_ADMIN_TOKEN
npx wrangler deploy
```

Deployment is intentionally separate from building the Mac app. Verify `/health` reports `activeClientTelemetryConfigured: true`, then verify unauthenticated `/admin/metrics` returns `401` before adding the token to Keychain.

## Logs

New persistent definitions write bounded operational logs under:

`~/Library/Application Support/ADSB Radar Gateway/`

The GUI shows state transitions, not raw FAA messages. `Reveal Logs` opens that folder in Finder.

## Rollback

Do not remove both production services at once.

1. Verify local authenticated gateway `/health` is live before changing the tunnel.
2. Verify `tais.adsbradar.net` rejects unauthenticated requests and accepts the Worker bearer token.
3. Restart only the affected LaunchAgent and verify recovery before touching the other service.
4. Verify Worker `/health` and a Phoenix `/api/aircraft` request when the Worker invocation quota is available.

The pre-migration quick-tunnel plist was retired on 2026-08-24 after the named
tunnel was verified end to end through the production Worker. Emergency recovery
must preserve the canonical `tais.adsbradar.net` hostname; do not restore an
ephemeral quick-tunnel URL or change the Worker's encrypted `TAIS_GATEWAY_URL`.

To remove a dedicated definition without touching unrelated processes:

```sh
launchctl bootout "gui/$(id -u)/com.captainseang.adsbradar.tais-gateway"
launchctl bootout "gui/$(id -u)/com.captainseang.adsbradar.tais-tunnel"
```

Then move only the two matching plist files out of `~/Library/LaunchAgents`. The protected environment copy can remain for recovery.

## Troubleshooting

- `Token Needed`: configure `tais-gateway-token` in Keychain.
- `Health Unavailable`: verify port `8788`, the token, and the gateway log.
- `Connecting` tunnel: inspect the tunnel log for `Registered tunnel connection`.
- tunnel hostname does not resolve: verify `adsbradar.net` delegates to `angelina.ns.cloudflare.com` and `lou.ns.cloudflare.com`, then verify the `tais` tunnel route.
- tunnel process runs but latency is blank: verify the Keychain health token and authenticated `https://tais.adsbradar.net/health`.
- no user metrics: deploy the Durable Object migration, configure `ADSB_ADMIN_TOKEN`, and add the same token to Keychain.
- Worker reachable but TAIS degraded: local ingestion may still be healthy; compare local FAA message age with Worker TAIS state and tunnel latency.
- Worker returns Cloudflare error `1027`: the Free Workers daily invocation quota is exhausted; the gateway and tunnel can remain healthy while public Worker requests wait for the quota reset.
