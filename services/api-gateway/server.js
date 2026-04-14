require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const fastifyJwt = require('@fastify/jwt');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifyProxy = require('@fastify/http-proxy');
const fastifyCors = require('@fastify/cors');
const { v4: uuidv4 } = require('uuid');
const eventBus = require('@agri-mvp/shared-events');

// JWT Registration (using RS256 keys from env)
fastify.register(fastifyJwt, {
  secret: {
    private: process.env.RS256_PRIVATE_KEY || 'default_secret',
    public: process.env.RS256_PUBLIC_KEY || 'default_secret'
  },
  sign: { algorithm: 'RS256' }
});

// Middleware: Request ID and Auth
fastify.addHook('onRequest', async (request, reply) => {
  request.id = uuidv4();
});

fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// Rate Limiting
fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// CORS
fastify.register(fastifyCors, { origin: '*' });

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

// Auth Routes
fastify.post('/auth/login', async (request, reply) => {
  const { username, role } = request.body;
  // Simple Mock Login for MVP
  const token = fastify.jwt.sign({ username, role });
  return { token };
});

// Proxy Routes to Services
// Marketplace Service
fastify.register(fastifyProxy, {
  upstream: process.env.MARKETPLACE_URL || 'http://marketplace-service:3001',
  prefix: '/marketplace',
  preHandler: [fastify.authenticate]
});

// AI Service
fastify.register(fastifyProxy, {
  upstream: process.env.AI_URL || 'http://ai-service:8000',
  prefix: '/ai',
  preHandler: [fastify.authenticate]
});

// Event-driven Bridge (Proxying + Event Publishing)
fastify.post('/listings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const listing = request.body;
  listing.id = uuidv4();
  listing.farmer_id = request.user.username; // Extract from JWT
  listing.status = 'DRAFT';

  // Publish event listing.created
  await eventBus.publish('listing.created', listing);

  return { message: 'Listing creation initiated', listing_id: listing.id };
});

fastify.post('/bids', { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const bid = request.body;
  bid.id = uuidv4();
  bid.buyer_id = request.user.username;

  // Publish event bid.placed
  await eventBus.publish('bid.placed', bid);

  return { message: 'Bid placement initiated', bid_id: bid.id };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
