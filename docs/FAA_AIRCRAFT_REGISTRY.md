# FAA Aircraft Identity Data

ADSB Radar builds its offline U.S. aircraft identity lookup from the FAA Aircraft Registry's
[Releasable Aircraft Database Download](https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download).
The FAA refreshes the source daily.

The generated product deliberately contains only Mode S hex, N-number, manufacturer, model,
aircraft category, and year. Owner names, addresses, and every other personal registry field are
discarded during generation and never bundled with the app.

## Rebuild

```sh
node scripts/build-faa-aircraft-registry.mjs
```

To rebuild from an already downloaded official archive:

```sh
node scripts/build-faa-aircraft-registry.mjs --input /path/to/ReleasableAircraft.zip
```

The command recreates `public/data/faa-aircraft/`, prints validation counts and size, and emits a
metadata index plus two-hex-prefix shards. The app fetches and caches only the shards required by
aircraft currently observed, keeping startup and memory impact low.

## Source and attribution

Source: Federal Aviation Administration, Civil Aviation Registry, Releasable Aircraft Database.
The source is an official U.S. Government public dataset. FAA is credited as the source; ADSB Radar
does not imply FAA endorsement. The generated lookup must be rebuilt periodically to remain current.
