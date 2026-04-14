Review the entire codebase structure first, then implement these improvements:

1. AI SERVICE - REAL PROPHET FORECASTING:
In services/ai-service, replace any naive price logic in the /recommend endpoint. It should accept crop_type, region, historical_prices (array of {date, price}), weather_data, and season. Train Prophet on the historical data and return a 7-day and 30-day price forecast with confidence intervals (yhat_lower, yhat_upper). Add a /retrain endpoint that accepts new outcome data and updates the model. Store trained models to disk per crop_type+region combo.

2. USDA DATA INGESTION:
In services/ingestion-service, add a new fetcher module usda.ts (or usda.js) that pulls specialty produce terminal market prices from the USDA AMS API (https://marsapi.ams.usda.gov). Target Dallas and Texas terminal markets. Parse the response and publish data.updated events with structured price records. Schedule it to run every 6 hours.

3. WEATHER INTEGRATION:
In services/ingestion-service, add a weather fetcher using OpenWeather API (https://api.openweathermap.org/data/2.5/forecast). Accept region coordinates from listings. Publish weather.updated events. The AI service should consume these events and store weather features for Prophet regressors.

4. PACA COMPLIANCE:
In services/payment-service, add PACA compliance. For all produce transactions over 1343 USD, require and log: seller_license, buyer_license, commodity_description, usda_grade, terms_of_sale. Add these columns to the transactions table migration. Add a validation middleware that rejects non-compliant transactions over the threshold.

5. DISPUTE FLOW:
In services/payment-service, extend the escrow lifecycle. Current: HELD -> RELEASED. Add: HELD -> DISPUTED -> RESOLVED_BUYER or RESOLVED_SELLER. Create a /disputes endpoint (POST to open, PATCH to resolve). Add reason_codes enum (QUALITY, QUANTITY, LATE_DELIVERY, NON_DELIVERY, OTHER). Add a disputes table (id, transaction_id, reason_code, opened_by, resolution, resolved_at). Publish dispute.opened and dispute.resolved events.

6. SEED DATA:
Create a /shared/seed directory with a seed script that generates realistic test data: 10 farmers, 5 buyers, 20 listings across 5 Texas produce crops (tomatoes, peppers, pecans, onions, watermelon), 6 months of mock USDA price history per crop, and 15 sample bids.

After all changes, make sure docker-compose.yml still wires everything correctly and all services start clean.
