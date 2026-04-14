require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const knex = require('knex')(require('./knexfile'));
const { v4: uuidv4 } = require('uuid');
const eventBus = require('@agri-mvp/shared-events');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'logistics-service' }));

// Matching Algorithm
async function matchDriver(shipmentId, listingId) {
  console.log(`Logistics: Matching driver for shipment ${shipmentId}`);
  // Mock: Find first available driver
  const driver = await knex('drivers').where('is_available', true).first();
  if (driver) {
    await knex('shipments')
      .where('id', shipmentId)
      .update({ driver_id: driver.id, status: 'ASSIGNED' });
    
    await knex('drivers')
      .where('id', driver.id)
      .update({ is_available: false });

    await eventBus.publish('shipment.assigned', { shipment_id: shipmentId, driver_id: driver.id });
  } else {
    console.log(`Logistics: No driver available for ${shipmentId}`);
  }
}

// Event Consumers
async function startConsumers() {
  await eventBus.subscribe('transaction.paid', 'logistics-group', 'logistics-consumer-1', async (data) => {
    console.log('Logistics: Transaction paid for listing:', data.listing_id);
    const shipmentId = uuidv4();
    await knex('shipments').insert({
      id: shipmentId,
      listing_id: data.listing_id,
      status: 'PENDING'
    });
    await matchDriver(shipmentId, data.listing_id);
  });
}

// Mock: Endpoint to mark shipment as delivered
fastify.post('/shipments/:id/deliver', async (request, reply) => {
  const { id } = request.params;
  const shipment = await knex('shipments').where('id', id).first();
  if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

  await knex('shipments').where('id', id).update({ status: 'DELIVERED' });
  await knex('drivers').where('id', shipment.driver_id).update({ is_available: true });

  await eventBus.publish('shipment.delivered', { shipment_id: id, listing_id: shipment.listing_id });
  return { message: 'Shipment delivered' };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3003, host: '0.0.0.0' });
    // Seed a mock driver
    await knex('drivers').insert({
      id: 'driver-1',
      name: 'John Doe',
      vehicle_type: 'Truck'
    }).onConflict('id').ignore();

    await startConsumers();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
