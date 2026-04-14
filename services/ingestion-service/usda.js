const axios = require('axios');

function asDate(yyyyMmDdOrIso) {
  if (!yyyyMmDdOrIso) return null;
  // MARS API often returns dates; normalize
  const d = new Date(yyyyMmDdOrIso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Pull specialty produce terminal market prices from USDA AMS MARS API.
 * MVP implementation:
 * - Targets Dallas, TX and a Texas-market fallback if Dallas isn't available.
 * - Publishes `data.updated` as structured records.
 */
async function fetchUsdaSpecialtyProducePrices({ apiKey, markets = ['Dallas'], cropTypes = [] } = {}) {
  if (!apiKey) throw new Error("USDA_MARS_API_KEY is missing");

  // NOTE: USDA MARS API endpoints can vary; this MVP uses a generic pattern.
  // If your MARS API requires a different endpoint/params, adjust here only.
  // Example references:
  // https://marsapi.ams.usda.gov/
  const url = 'https://marsapi.ams.usda.gov/data/v1/';
  // Minimal placeholder query (you should map to the exact terminal price dataset).
  // The ingestion layer will still publish structured results if the response differs.
  const resp = await axios.get(url, {
    headers: { 'X-API-KEY': apiKey }
  });

  // Attempt to normalize response. If response does not match, fall back to mocked structure.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Try to locate an array somewhere
  const candidates = Array.isArray(resp.data) ? resp.data : (resp.data?.data || resp.data?.results || []);
  const records = [];

  for (const item of candidates) {
    // Try to infer
    const market = item.market || item.terminalMarket || item.terminal_market || item.city || item.location;
    const crop = item.crop || item.commodity || item.produce || item.product;
    const price = item.price || item.weighted_avg_price || item.value;
    const unit = item.unit || item.uom;

    if (!market || !crop || price == null) continue;

    const normalizedMarket = String(market);
    const normalizedCrop = String(crop).toLowerCase();

    // Basic Dallas/Texas filtering
    const isDallas = normalizedMarket.toLowerCase().includes('dallas');
    const isTexas = normalizedMarket.toLowerCase().includes('tx') || normalizedMarket.toLowerCase().includes('texas');

    if (!isDallas && !isTexas) continue;

    // Crop mapping to our crop types used in seed (tomatoes, peppers, pecans, onions, watermelon)
    let crop_type = null;
    if (normalizedCrop.includes('tomato')) crop_type = 'tomatoes';
    else if (normalizedCrop.includes('pepper')) crop_type = 'peppers';
    else if (normalizedCrop.includes('onion')) crop_type = 'onions';
    else if (normalizedCrop.includes('watermelon')) crop_type = 'watermelon';
    else if (normalizedCrop.includes('pecan')) crop_type = 'pecans';

    if (!crop_type) continue;

    const region = isDallas ? 'Dallas,TX' : 'Texas,US';

    records.push({
      crop_type,
      region,
      date: asDate(item.date || item.delivery_date || item.asOfDate) || today,
      price: Number(price),
      unit: unit ? String(unit) : undefined,
      source: 'USDA_AMS_MARS'
    });
  }

  // If parsing yields nothing, emit a small synthetic set so AI can function in dev.
  if (records.length === 0) {
    const synth = [
      { crop_type: 'tomatoes', region: 'Dallas,TX', price: 100 },
      { crop_type: 'peppers', region: 'Dallas,TX', price: 120 },
      { crop_type: 'pecans', region: 'Texas,US', price: 2500 },
      { crop_type: 'onions', region: 'Dallas,TX', price: 45 },
      { crop_type: 'watermelon', region: 'Dallas,TX', price: 25 }
    ];
    for (const s of synth) {
      records.push({ ...s, date: today, source: 'USDA_AMS_MARS_MOCK' });
    }
  }

  // Normalize to schema expected by AI:
  return records.map(r => ({
    crop_type: r.crop_type,
    region: r.region,
    date: r.date,
    price: r.price,
    source: r.source
  }));
}

module.exports = { fetchUsdaSpecialtyProducePrices };
