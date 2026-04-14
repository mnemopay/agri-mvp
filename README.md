# AI Agricultural Marketplace MVP

Full event-driven monorepo with AI-powered forecasting, logistics, and escrow payments.

## Structure
- `/services`: 6 microservices (Fastify, FastAPI)
- `/shared`: Shared event bus and DB initialization
- `docker-compose.yml`: Full orchestration

## Services
1. **API Gateway**: Entry point, JWT Auth (RS256), Rate limiting.
2. **Marketplace Service**: CRUD for listings and bids, buyer-farmer matching.
3. **AI Service**: Price forecasting using Prophet, recommendations.
4. **Ingestion Service**: Scheduled fetchers for commodity prices & weather.
5. **Logistics Service**: Driver matching and shipment tracking.
6. **Payment Service**: Escrow-based transactions.

## How to Run
1. Ensure Docker and Docker Compose are installed.
2. Run `docker-compose up --build`.
3. The API Gateway will be available at `http://localhost:3000`.

## Example Flow
1. **Login**: `POST /auth/login` with `{"username": "farmer1", "role": "FARMER"}` to get a token.
2. **Create Listing**: `POST /listings` with token and `{"crop_type": "Maize", "quantity": 100, "price": 110, "location": "Lagos"}`.
3. **Check Recommendation**: The AI Service will automatically suggest a price via the event bus.
4. **Place Bid**: `POST /bids` with token and `{"listing_id": "...", "bid_price": 115}`.
5. **Escrow**: Payment service will hold funds.
6. **Fulfillment**: Logistics service will assign a driver.
7. **Delivery**: Mark shipment as delivered to release funds.

## Tech Stack
- **Node.js/Fastify**: API Gateway, Marketplace, Ingestion, Logistics, Payment.
- **Python/FastAPI**: AI Service.
- **PostgreSQL**: Multiple databases for persistent storage.
- **Redis**: Event bus using Redis Streams.
- **Prophet**: Time-series forecasting.
