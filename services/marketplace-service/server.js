require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const knex = require('knex')(require('./knexfile'));
const eventBus = require('@agri-mvp/shared-events');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'marketplace-service' }));

// Listings Read
fastify.get('/listings', async () => {
  return await knex('listings').select('*').whereNot('status', 'CANCELLED');
});

fastify.get('/listings/:id', async (request, reply) => {
  const listing = await knex('listings').where('id', request.params.id).first();
  if (!listing) reply.status(404).send({ error: 'Listing not found' });
  return listing;
});

// Event Consumers
async function startConsumers() {
  // listing.created -> persist and mark as ACTIVE
  await eventBus.subscribe('listing.created', 'marketplace-group', 'marketplace-consumer-1', async (data) => {
    console.log('Processing listing.created:', data.id);
    // Ensure user exists (Mock check)
    await knex('users').insert({ id: data.farmer_id, username: data.farmer_id, role: 'FARMER' }).onConflict('id').ignore();

    await knex('listings').insert({
      id: data.id,
      farmer_id: data.farmer_id,
      crop_type: data.crop_type,
      quantity: data.quantity,
      price: data.price,
      location: data.location,
      status: 'ACTIVE'
    });
  });

  // ai.price.suggested -> update listing
  await eventBus.subscribe('ai.price.suggested', 'marketplace-group', 'marketplace-consumer-1', async (data) => {
    console.log('Processing ai.price.suggested for:', data.listing_id);
    await knex('listings')
      .where('id', data.listing_id)
      .update({ ai_recommended_price: data.suggested_price });
  });

  // bid.placed -> persist and notify
  await eventBus.subscribe('bid.placed', 'marketplace-group', 'marketplace-consumer-1', async (data) => {
    console.log('Processing bid.placed for:', data.listing_id);
    // Ensure user exists (Mock check)
    await knex('users').insert({ id: data.buyer_id, username: data.buyer_id, role: 'BUYER' }).onConflict('id').ignore();

    await knex('bids').insert({
      id: data.id,
      listing_id: data.listing_id,
      buyer_id: data.buyer_id,
      bid_price: data.bid_price,
      status: 'PENDING'
    });
  });
}

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3001, host: '0.0.0.0' });
    await startConsumers();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
