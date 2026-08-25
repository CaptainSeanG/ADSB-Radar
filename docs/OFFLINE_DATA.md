# ADSB Radar Offline Data

ADSB Radar bundles airport and airspace data so the native iPad/iPhone app can render useful aviation context while connected to Stratus Wi-Fi with no internet route.

## Airports

- Source: OurAirports downloadable CSV data
- Source URL: <https://davidmegginson.github.io/ourairports-data/>
- Files used: `airports.csv`, `runways.csv`, `airport-frequencies.csv`
- License/terms: OurAirports states that its downloadable data is released to the Public Domain, with no guarantee of accuracy or fitness for use. Attribution is appreciated by OurAirports but not required.
- Generated file: `public/data/offline-airports.json`
- Coverage: United States, Puerto Rico, U.S. Virgin Islands, Guam, American Samoa, Northern Mariana Islands, and U.S. minor outlying islands
- Included types: large airports, medium airports, small airports, and seaplane bases
- Excluded: closed airports, unsupported facility types, invalid coordinates, and duplicate primary identifiers

Pilot-facing airport-card fields are enriched from the FAA 28-Day NASR Subscription, effective August 6, 2026:

- FAA source page: <https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-08-06/>
- `APT_BASE.csv`: FAA identifier, elevation, tower type, and published traffic-pattern altitude in feet AGL
- `APT_RMK.csv`: airport TPA remarks, including airports with different piston, turbine, or helicopter patterns
- `APT_ATT.csv`: airport attendance/facility hours
- `APT_RWY.csv` and `APT_RWY_END.csv`: runway dimensions, endpoints, and true alignment
- `ATC_BASE.csv`: authoritative ATCT status and published tower hours
- `FRQ.csv`: role-specific ATIS, AWOS, ASOS, Clearance, Ground, Tower, CTAF, UNICOM, Approach, and Departure frequencies

The builder labels a single FAA `TPA` value as published, derives MSL by adding the FAA airport elevation, and retains both MSL and AGL. Multiple-pattern remarks are stored as `See Remarks` with the FAA remark preserved. If FAA publishes no airport-specific TPA, the UI displays `1,000 AGL (standard)` and identifies that value as FAA AIM standard guidance rather than FAA-published airport data.

The generated runway heading fields are true alignments. Current METAR wind direction is also true, so Best Wind calculations compare compatible references. The magnetic runway-end identifier is used only as the pilot-facing label. Current METAR is fetched asynchronously through the ADSB Radar Worker from the official AviationWeather.gov API and is not part of the offline bundle.

The generated JSON keeps the schema consumed by `public/app.js`: a top-level `metadata` object and an `airports` array. Schema version 3 adds `tpa`, `towered`, `towerHours`, `facilityHours`, FAA frequency `roles`, runway `headingReference`, and `faaSourceCycle`. The current generated bundle contains 16,867 airport records.

## Airspace

- Source: FAA ArcGIS `Class_Airspace` and `Special_Use_Airspace` FeatureServers
- Source URLs:
  - <https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0>
  - <https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0>
- Generated file: `public/data/offline-airspace.json`
- Included classes: B, C, D, E, and special-use airspace
- Included special-use types: prohibited, restricted, MOA, warning, and alert areas
- Geometry: polygon rings normalized into the existing `public/app.js` `rings` format
- Attribution: U.S. Federal Aviation Administration public aviation data. ADSB Radar normalizes the FAA service geometry for offline display and does not imply FAA certification or endorsement.

The renderer consumes the same normalized ring schema for class and special-use airspace. Special-use features are stored as `classCode: "SUA"` with a `typeCode` such as `P`, `R`, `MOA`, `W`, or `A`.

## Tiles

The national JSON files remain as compatibility fallbacks, but the app prefers nearby 4-degree tiles generated under `public/data/tiles/`. This keeps offline boot responsive and prevents the radar from parsing the full national data set before showing nearby airports and airspace.

- Tile index: `public/data/tiles/index.json`
- Airport tiles: `public/data/tiles/airports/*.json`
- Airspace tiles: `public/data/tiles/airspace/*.json`

## Rebuild Commands

```bash
node scripts/build-offline-airports.mjs --refresh --nasr-cycle=2026-08-06
node scripts/build-offline-airspace.mjs
node scripts/build-offline-tiles.mjs
node scripts/validate-offline-data.mjs
```

The airport builder caches source CSVs and FAA ZIP archives under `data/source/`. Pass `--refresh` to redownload. For a new FAA cycle, update `--nasr-cycle=YYYY-MM-DD`; archive names are derived from that effective date. The airspace builder queries the FAA service directly with pagination.

## Storage Strategy

The bundled files are app resources under `public/data/`, so they remain available after restart with no network. The native asset handler also checks `Application Support/ADSB Radar/OfflineData` first for future downloaded replacements, then falls back to the bundled copies.
