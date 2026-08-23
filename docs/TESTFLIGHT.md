# ADSB Radar TestFlight Checklist

## Current App Values

- App name: ADSB Radar
- Bundle ID: `com.captainseang.adsbradar`
- SKU suggestion: `ADSB-RADAR-IOS`
- Primary language: English (U.S.)
- Category suggestion: Navigation
- Marketing version: `1.0`
- Build number: `1`
- Copyright: `Copyright 2026 CaptainSeanG. All rights reserved.`

## App Store Connect Setup

1. Sign in to App Store Connect.
2. Open **My Apps**.
3. Click **+** and choose **New App**.
4. Platform: **iOS**.
5. Name: **ADSB Radar**.
6. Primary language: **English (U.S.)**.
7. Bundle ID: `com.captainseang.adsbradar`.
8. SKU: `ADSB-RADAR-IOS`.
9. User Access: choose the appropriate full-access option for now.
10. Complete any pending Paid Apps / tax / banking agreements before enabling paid distribution.
11. Set category to **Navigation**.
12. Add privacy policy URL before public App Store submission.
13. Complete App Privacy using `docs/PRIVACY.md`.

## Upload Build From Xcode

1. Open `/Users/seangallagher/ADSB-Radar/ios/ADSB-Radar/ADSBRadar.xcodeproj`.
2. Select the shared scheme **ADSB Radar**.
3. Select **Any iOS Device** or a connected physical device, not a simulator.
4. Choose **Product > Archive**.
5. In Organizer, select the archive.
6. Click **Distribute App**.
7. Choose **TestFlight & App Store**.
8. Choose **Upload**.
9. Use automatic signing.
10. Review certificate, provisioning profile, and entitlements.
11. Upload.
12. Wait for App Store Connect processing email.

## TestFlight Internal Beta

1. In App Store Connect, open **ADSB Radar**.
2. Go to **TestFlight**.
3. Select the processed build.
4. Add beta app information.
5. Create or select an internal testing group.
6. Add App Store Connect users as internal testers.
7. Add the build to the group.
8. Install from the TestFlight app on test devices.

## TestFlight External Beta

1. Create an external tester group.
2. Add tester emails or create a public invitation link.
3. Add the build to the group.
4. Complete Beta App Review information.
5. Submit for Beta App Review.
6. Share the invitation after approval.

## Beta App Description

ADSB Radar is a cockpit situational-awareness app for iPhone and iPad. It displays nearby traffic, ownship position, airports, and airspace using Stratus/GDL90 data when available, with nationwide offline aviation context for no-internet cockpit use.

## What To Test

- Stratus 3 / GDL90 connectivity on cockpit Wi-Fi
- Traffic display on 360 radar and ARC radar
- Track-up behavior and heading fallback
- Nationwide offline airports and airspace
- Weather controls when internet is available
- iPhone and iPad layout, especially iPad mini and smaller iPhones
- Proximity alerts and alert clearing
- ATC #Pad and finger/stylus Notes
- Offline startup with Stratus Wi-Fi and no internet route

## Test Notes

ADSB Radar is for supplemental situational awareness only. It is not a certified primary flight instrument, official navigation source, or substitute for see-and-avoid. Traffic, weather, airport, and airspace data may be incomplete or inaccurate.

Please report device model, iOS version, Stratus model/firmware if known, whether internet was available, and screenshots or screen recordings for layout or alert issues.

## Offline Test Matrix

- Airplane Mode ON, Wi-Fi ON, connected only to Stratus Wi-Fi: app starts, Stratus becomes LIVE, ownship/traffic render, offline airports/airspace render, #Pad and Notes work.
- No Stratus and no internet: app starts, offline airports/airspace render, GPS works where available, status shows no Stratus/traffic source.
- Internet plus Stratus: online enhancements work, offline database remains usable, Stratus remains independent of internet state.

Representative locations: Phoenix, Los Angeles, New York, Seattle, Anchorage, Honolulu.
