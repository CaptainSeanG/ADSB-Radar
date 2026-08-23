# ADSB Radar Privacy Notes

This document records the current privacy behavior for TestFlight and App Store privacy-label preparation.

## Data Collection

ADSB Radar does not currently collect personal data, use analytics, use advertising SDKs, track users, require user accounts, or send crash telemetry.

## Data Stored On Device

- Radar preferences are stored in browser local storage inside the app WebView.
- Tracked N-number preferences and cached airspace/airport rows may be stored locally.
- ATC scratchpad text and Notes canvas content are local app state.
- Bundled aviation data ships in the app. Future offline data replacements may be read from `Application Support/ADSB Radar/OfflineData`.

## Location And Motion

- Device location is used to center the radar and provide ownship/track fallback when Stratus ownship data is unavailable.
- Device heading/orientation is used only as a fallback for track-up situational awareness.
- Location history is not uploaded or stored as a history log by the native app.

## Networking

- The native app listens on the local cockpit Wi-Fi network for Stratus/GDL90 UDP traffic and exposes decoded traffic only inside the app.
- Stratus/GDL90 traffic is not uploaded by the native app.
- Internet ADS-B and weather fetches may be used when internet is available and configured by the radar runtime.
- The app does not send user identity, account data, or analytics events.

## Privacy Manifest

`ios/ADSB-Radar/ADSBRadar/PrivacyInfo.xcprivacy` currently declares:

- `NSPrivacyTracking`: `false`
- `NSPrivacyCollectedDataTypes`: empty
- `NSPrivacyAccessedAPITypes`: empty

Code audit notes:

- Native protected resources: Location, local network, and heading/orientation fallback.
- Required-reason API categories: no direct native use found for UserDefaults, file timestamps, disk capacity, system boot time, or active keyboards.
- `WKWebView` local storage is used by the radar UI for app preferences and local cache state.

## App Store Privacy Nutrition Label Draft

- Data collected: None
- Data linked to user: None
- Data used to track user: No
- Location: Used on device for app functionality; not collected by developer
- Diagnostics: Not collected by developer
- Contact info: Not collected by app
- User content: Notes/scratchpad remain on device

Re-check this document before App Store submission if analytics, crash reporting, accounts, subscriptions, server sync, cloud backup, or telemetry are added.
