const axios = require('axios');

/**
 * Fetch OpenWeather 5-day forecast and publish structured weather features.
 * Accepts region coordinates.
 */
async function fetchOpenWeatherForecast({ apiKey, latitude, longitude }) {
  if (!apiKey) throw new Error("OPENWEATHER_API_KEY is missing");
  const url = 'https://api.openweathermap.org/data/2.5/forecast';

  const resp = await axios.get(url, {
    params: {
      lat: latitude,
      lon: longitude,
      units: 'imperial',
      appid: apiKey
    }
  });

  const list = resp.data?.list || [];
  // Convert 3-hour buckets into daily aggregates
  const buckets = {};
  for (const point of list) {
    const ts = new Date(point.dt * 1000).toISOString();
    const d = ts.slice(0, 10);
    if (!buckets[d]) buckets[d] = { count: 0, temps: [], hums: [], winds: [], clouds: [] };
    buckets[d].count += 1;
    buckets[d].temps.push(point.main?.temp);
    buckets[d].hums.push(point.main?.humidity);
    buckets[d].winds.push(point.wind?.speed);
    buckets[d].clouds.push(point.clouds?.all);
    // approximate rain probability: if 'rain' exists, treat as 100%, else 0%
    buckets[d].clouds = buckets[d].clouds;
    buckets[d].rainExists = buckets[d].rainExists || [];
    buckets[d].rainExists.push(point.rain ? 1 : 0);
  }

  const featuresByDay = Object.keys(buckets).map(d => {
    const b = buckets[d];
    const avg = arr => arr.reduce((a, c) => a + c, 0) / Math.max(1, arr.length);
    const rainProb = (b.rainExists?.reduce((a, c) => a + c, 0) || 0) / Math.max(1, (b.count || 1));

    return {
      date: d,
      forecast_time: new Date(d + 'T12:00:00Z').toISOString(),
      features: {
        temp_avg: avg(b.temps),
        temp_min: Math.min(...b.temps),
        temp_max: Math.max(...b.temps),
        humidity_avg: avg(b.hums),
        wind_speed_avg: avg(b.winds),
        rain_prob: rainProb,
        cloud_cover_avg: avg(b.clouds)
      }
    };
  });

  return featuresByDay;
}

module.exports = { fetchOpenWeatherForecast };
