# Permanent FAA TAIS Tunnel

## Production Path

`FAA SWIM/SCDS -> local Java TAIS gateway -> Cloudflare named tunnel -> tais.adsbradar.net -> adsb-radar-proxy Worker -> ADSB Radar clients`

The domain `adsbradar.net` is registered at GoDaddy and delegates DNS to Cloudflare:

- `angelina.ns.cloudflare.com`
- `lou.ns.cloudflare.com`

Only `tais.adsbradar.net` is required for the gateway. The DNS design leaves `www`, `api`, and `status` available for future work without creating those services now.

## Tunnel Configuration

- Cloudflare account: the existing account that owns `adsb-radar-proxy`
- zone plan: Free
- tunnel name: `adsb-radar-tais`
- tunnel UUID: `19b9d6d0-5ad4-4b0c-b113-1ffc7bdece1e`
- hostname: `tais.adsbradar.net`
- origin: `http://127.0.0.1:8788`
- config: `~/.cloudflared/adsb-radar-tais.yml`
- LaunchAgent: `com.captainseang.adsbradar.tais-tunnel`
- log: `~/Library/Application Support/ADSB Radar Gateway/tais-tunnel.log`

The cloudflared origin certificate and tunnel credential JSON remain owner-only under `~/.cloudflared`. They must never be copied into Git, logs, app resources, or Worker configuration.

The ingress configuration contains one hostname rule and a final `http_status:404` catch-all. The gateway itself requires its existing bearer token; unauthenticated health and traffic requests return `401`.

## Worker Relationship

The existing `adsb-radar-proxy` Worker uses two encrypted secrets:

- `TAIS_GATEWAY_URL`: `https://tais.adsbradar.net`
- `TAIS_GATEWAY_TOKEN`: existing bearer token, unchanged

Changing or restarting the named tunnel does not require a Worker URL update. Do not create a second Worker for this path.

## Operations

Both LaunchAgents use `RunAtLoad` and `KeepAlive` and start after the user logs in:

- `com.captainseang.adsbradar.tais-gateway`
- `com.captainseang.adsbradar.tais-tunnel`

The gateway reconnects to the FAA queue after restart. The named tunnel reconnects to Cloudflare while preserving `tais.adsbradar.net`. Do not configure a second startup mechanism.

Useful checks:

```sh
launchctl print "gui/$(id -u)/com.captainseang.adsbradar.tais-gateway"
launchctl print "gui/$(id -u)/com.captainseang.adsbradar.tais-tunnel"
dig +short A tais.adsbradar.net
```

Authenticated gateway checks should read the bearer token from its protected file or macOS Keychain without placing it in shell history or process arguments.

## Troubleshooting

- No DNS response: confirm the registrar still delegates to the two assigned Cloudflare nameservers.
- Tunnel stopped: inspect the named-tunnel log, then restart only its LaunchAgent.
- Tunnel connected but gateway unavailable: verify `127.0.0.1:8788`, the gateway LaunchAgent, and FAA message age.
- Public request returns `401`: authentication is working; verify the caller supplies the correct protected token.
- Worker returns Cloudflare `1027`: the Free Workers daily invocation quota is exhausted. This is independent of FAA JMS and tunnel health.

## Recovery

The temporary quick-tunnel rollback was retired after the permanent named tunnel
was verified end to end on August 24, 2026. Recovery should restart or repair the
existing `adsb-radar-tais` named tunnel while preserving `tais.adsbradar.net`.
Do not restore an ephemeral quick-tunnel URL or change the Worker's encrypted
`TAIS_GATEWAY_URL` during routine recovery.
