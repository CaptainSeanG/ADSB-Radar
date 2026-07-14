# ADSB Radar Offline Data

ADSB Radar bundles airport and airspace data so the native iPad/iPhone app can render useful aviation context while connected to Stratus Wi-Fi with no internet route.

## Airports

- Source: OurAirports downloadable CSV data
- Source URL: <https://davidmegginson.github.io/ourairports-data/>
- Files used: `airports.csv`, `runways.csv`
- Generated file: `public/data/offline-airports.json`
- Coverage: United States, Puerto Rico, U.S. Virgin Islands, Guam, American Samoa, Northern Mariana Islands, and U.S. minor outlying islands
- Included types: large airports, medium airports, small airports, and seaplane bases
- Excluded: closed airports, unsupported facility types, invalid coordinates, and duplicate primary identifiers

The generated JSON keeps the schema consumed by `public/app.js`: a top-level `metadata` object and an `airports` array. Airport objects include identifiers, name, location, type, elevation where available, municipality/state/country where available, and runway endpoint geometry when available.

## Airspace

- Source: FAA ArcGIS `Class_Airspace` FeatureServer
- Source URL: <https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0>
- Generated file: `public/data/offline-airspace.json`
- Included classes: B, C, D, and E
- Geometry: polygon rings normalized into the existing `public/app.js` `rings` format

The renderer currently consumes class airspace outlines. Special-use airspace is not currently drawn by the app, so it is not bundled in this pass.

## Rebuild Commands

```bash
node scripts/build-offline-airports.mjs --refresh
node scripts/build-offline-airspace.mjs
```

The airport builder caches source CSVs under `data/source/`. Pass `--refresh` to redownload. The airspace builder queries the FAA service directly with pagination.

## Storage Strategy

The bundled files are app resources under `public/data/`, so they remain available after restart with no network. The native asset handler also checks `Application Support/ADSB Radar/OfflineData` first for future downloaded replacements, then falls back to the bundled copies.
