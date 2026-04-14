require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cron = require('node-cron');
const axios = require('axios');
const eventBus = require('@agri-mvp/shared-events');

const { fetchUsdaSpecialtyProducePrices } = require('./usda');
const { fetchOpenWeatherForecast } = require('./weather');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'ingestion-service' }));

function getTexasCoordinates() {
  // Dallas TX default; plus a couple of Texas reference points for MVP
  return [
    { region: 'Dallas,TX', latitude: 32.7767, longitude: -96.7970 },
    { region: 'Texas,US', latitude: 29.7604, longitude: -95.3698 } // Houston
  ];
}

async function fetchCommodityPrices() {
  console.log('Ingestion: Fetching USDA terminal market prices...');
  const apiKey = process.env.USDA_MARS_API_KEY;

  const records = await fetchUsdaSpecialtyProducePrices({
    apiKey,
    markets: ['Dallas'],
    cropTypes: ['tomatoes', 'peppers', 'pecans', 'onions', 'watermelon']
  });

  await eventBus.publish('data.updated', {
    type: 'PRICES',
    records
  });
}

async function fetchWeatherData() {
  console.log('Ingestion: Fetching OpenWeather forecast...');
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const locations = getTexasCoordinates();

  const allRecords = [];

  for (const loc of locations) {
    const daily = await fetchOpenWeatherForecast({
      apiKey,
      latitude: loc.latitude,
      longitude: loc.longitude
    });

    for (const d of daily) {
      allRecords.push({
        region: loc.region,
        latitude: loc.latitude,
        longitude: loc.longitude,
        forecast_time: d.forecast_time,
        features: d.features,
        source: 'OPENWEATHER_FORECAST'
      });
    }
  }

  await eventBus.publish('weather.updated', {
    type: 'WEATHER',
    records: allRecords
  });
}

// Schedule Jobs: USDA every 6 hours, weather every 3 hours
cron.schedule('0 */6 * * *', fetchCommodityPrices);
cron.schedule('0 */3 * * *', fetchWeatherData);

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3002, host: '0.0.0.0' });
    // Run initial fetch
    fetchCommodityPrices();
    fetchWeatherData();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
