window.ADSB_RADAR_PROXY_URL = "https://adsb-radar-proxy.macgyver2.workers.dev";
window.ADSB_RADAR_STRATUS_URL = (() => {
  const host = window.location.hostname;
  const localHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  return localHost ? `${window.location.protocol}//${host}:8787` : "";
})();
