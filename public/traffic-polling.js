export const trafficPollIntervalsMs = Object.freeze({
  stratusLive: 750,
  stratusStale: 1400,
  localWifiLive: 1200,
  localWifiStale: 1800,
  faaTais: 5000,
  internetLive: 1500,
  internetStale: 2500,
  unknown: 6500
});

export function trafficPollIntervalMs({ source = "", stale = false, localNetworkProxy = false } = {}) {
  const sourceText = String(source || "").toLowerCase();
  const localWifi =
    sourceText.includes("wifi") || (sourceText.includes("ads-b") && Boolean(localNetworkProxy));
  const internet =
    sourceText.includes("internet") ||
    sourceText.includes("network") ||
    sourceText.includes("airplanes.live") ||
    sourceText.includes("adsb.lol") ||
    sourceText.includes("adsb.fi");
  const faaTais = sourceText.includes("faa tais") || sourceText.includes("faa-tais");

  if (sourceText.includes("stratus")) {
    return stale ? trafficPollIntervalsMs.stratusStale : trafficPollIntervalsMs.stratusLive;
  }
  if (localWifi) {
    return stale ? trafficPollIntervalsMs.localWifiStale : trafficPollIntervalsMs.localWifiLive;
  }
  if (faaTais) return trafficPollIntervalsMs.faaTais;
  if (internet) {
    return stale ? trafficPollIntervalsMs.internetStale : trafficPollIntervalsMs.internetLive;
  }
  return trafficPollIntervalsMs.unknown;
}

export function workerTrafficPollingAllowed({ pageVisible = true, nativeAppActive = true } = {}) {
  return Boolean(pageVisible && nativeAppActive);
}
