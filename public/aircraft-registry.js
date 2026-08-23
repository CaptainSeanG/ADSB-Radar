export function normalizeIcaoHex(value) {
  const hex = String(value || "").trim().toUpperCase().replace(/^0X/, "");
  return /^[0-9A-F]{6}$/.test(hex) ? hex : "";
}

export function registryRecordFromCompact(hex, compact) {
  if (!Array.isArray(compact)) return null;
  const [registration = "", manufacturer = "", model = "", category = "", year = 0] = compact;
  return {
    source: "FAA",
    icaoHex: normalizeIcaoHex(hex),
    registration,
    manufacturer,
    model,
    category,
    year: Number(year) || null,
    displayType: model || [manufacturer, category].filter(Boolean).join(" ")
  };
}

const defaultRegistryBaseUrl = new URL("./data/faa-aircraft", import.meta.url).href;

export class FaaAircraftRegistry {
  constructor({ baseUrl = defaultRegistryBaseUrl, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.shardPromises = new Map();
    this.resolutionCache = new Map();
  }

  async loadShard(prefix) {
    if (!this.shardPromises.has(prefix)) {
      const promise = this.fetchImpl(`${this.baseUrl}/${prefix}.json`, { cache: "force-cache" })
        .then((response) => (response.ok ? response.json() : { records: {} }))
        .then((payload) => payload.records || {})
        .catch(() => ({}));
      this.shardPromises.set(prefix, promise);
    }
    return this.shardPromises.get(prefix);
  }

  async resolve(value) {
    const hex = normalizeIcaoHex(value);
    if (!hex) return null;
    if (this.resolutionCache.has(hex)) return this.resolutionCache.get(hex);
    const records = await this.loadShard(hex.slice(0, 2).toLowerCase());
    const resolved = registryRecordFromCompact(hex, records[hex]);
    this.resolutionCache.set(hex, resolved);
    return resolved;
  }
}
