require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const knex = require('knex')(require('./knexfile'));
const { v4: uuidv4 } = require('uuid');
const eventBus = require('@agri-mvp/shared-events');

const PACA_THRESHOLD = parseFloat(process.env.PACA_THRESHOLD || '1343');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'payment-service' }));

function requirePacaForLargeTransactions(request) {
  const body = request.body || {};
  const amount = body.amount;
  if (amount == null) return;

  if (Number(amount) <= PACA_THRESHOLD) return;

  const required = [
    'seller_license',
    'buyer_license',
    'commodity_description',
    'usda_grade',
    'terms_of_sale'
  ];

  const missing = required.filter((k) => !body[k] || String(body[k]).trim() === '');
  if (missing.length > 0) {
    throw fastify.httpErrors.badRequest(
      `PACA compliance required for transactions over ${PACA_THRESHOLD}. Missing: ${missing.join(', ')}`
    );
  }
}

// Mock: validation middleware for open endpoints where transactions are created.
// In current codebase, transactions are created via bid.placed consumer only.
// We'll also support an explicit endpoint to open a dispute/reconcile later.
fastify.addHook('preHandler', async (request) => {
  // only apply for routes that create/accept transaction payloads
  if (['/disputes'].includes(request.routerPath) && request.method === 'POST') {
    requirePacaForLargeTransactions(request);
  }
});

// Event Consumers
async function startConsumers() {
  // bid.placed -> trigger escrow hold (mock)
  await eventBus.subscribe('bid.placed', 'payment-group', 'payment-consumer-1', async (data) => {
    console.log('Payment: Holding funds for bid:', data.id);

    const transactionId = uuidv4();

    // For MVP: we don’t yet have bid->licenses mapping.
    // Create record without PACA fields; if you wire seller/buyer licenses later,
    // add them and reconcile. Validation is enforced on explicit dispute open path below.
    await knex('transactions').insert({
      id: transactionId,
      listing_id: data.listing_id,
      buyer_id: data.buyer_id,
      farmer_id: 'mock-farmer', // In real life, fetch from marketplace
      amount: data.bid_price,
      status: 'HELD'
    });

    await eventBus.publish('payment.escrow.success', { bid_id: data.id, transaction_id: transactionId });
    await eventBus.publish('transaction.paid', { listing_id: data.listing_id, amount: data.bid_price });
  });

  // shipment.delivered -> release funds
  await eventBus.subscribe('shipment.delivered', 'payment-group', 'payment-consumer-1', async (data) => {
    console.log('Payment: Releasing funds for listing:', data.listing_id);

    // release for all matching transactions by listing_id (MVP)
    await knex('transactions')
      .where('listing_id', data.listing_id)
      .update({ status: 'RELEASED' });
  });
}

// Disputes
fastify.post('/disputes', async (request, reply) => {
  /**
   * body:
   * {
   *   transaction_id,
   *   reason_code: enum,
   *   opened_by,
   *   resolution?, description?,
   *   // PACA fields (required if transaction amount > threshold)
   *   seller_license, buyer_license, commodity_description, usda_grade, terms_of_sale,
   *   amount (optional; if not provided we fetch transaction)
   * }
   */
  const {
    transaction_id,
    reason_code,
    opened_by,
    description,
    resolution,
    seller_license,
    buyer_license,
    commodity_description,
    usda_grade,
    terms_of_sale,
    amount
  } = request.body || {};

  if (!transaction_id || !reason_code || !opened_by) {
    return reply.status(400).send({ error: 'transaction_id, reason_code, and opened_by are required' });
  }

  const tx = await knex('transactions').where('id', transaction_id).first();
  if (!tx) return reply.status(404).send({ error: 'Transaction not found' });

  const txAmount = amount != null ? Number(amount) : Number(tx.amount);

  if (txAmount > PACA_THRESHOLD) {
    const required = { seller_license, buyer_license, commodity_description, usda_grade, terms_of_sale };
    const missing = Object.entries(required)
      .filter(([_, v]) => !v || String(v).trim() === '')
      .map(([k]) => k);

    if (missing.length) {
      return reply.status(400).send({ error: `PACA compliance required. Missing: ${missing.join(', ')}` });
    }

    // persist PACA columns onto transaction
    await knex('transactions')
      .where('id', transaction_id)
      .update({
        seller_license,
        buyer_license,
        commodity_description,
        usda_grade,
        terms_of_sale
      });
  }

  // open dispute
  await knex('transactions')
    .where('id', transaction_id)
    .update({ status: 'DISPUTED' });

  const disputeId = uuidv4();
  await knex('disputes').insert({
    id: disputeId,
    transaction_id,
    reason_code,
    opened_by,
    description: description || null,
    resolution: null,
    resolved_at: null
  });

  await eventBus.publish('dispute.opened', {
    dispute_id: disputeId,
    transaction_id,
    reason_code,
    opened_by
  });

  return reply.send({ dispute_id: disputeId });
});

fastify.patch('/disputes/:id', async (request, reply) => {
  /**
   * body:
   * { resolution: 'RESOLVED_BUYER'|'RESOLVED_SELLER', resolved_at? }
   */
  const { id } = request.params;
  const { resolution } = request.body || {};

  if (!resolution || !['RESOLVED_BUYER', 'RESOLVED_SELLER'].includes(resolution)) {
    return reply.status(400).send({ error: 'resolution must be RESOLVED_BUYER or RESOLVED_SELLER' });
  }

  const dispute = await knex('disputes').where('id', id).first();
  if (!dispute) return reply.status(404).send({ error: 'Dispute not found' });

  await knex('disputes')
    .where('id', id)
    .update({
      resolution,
      resolved_at: new Date()
    });

  // Update escrow transaction status
  if (resolution === 'RESOLVED_BUYER') {
    await knex('transactions').where('id', dispute.transaction_id).update({ status: 'REFUNDED' });
  } else {
    await knex('transactions').where('id', dispute.transaction_id).update({ status: 'RELEASED' });
  }

  await eventBus.publish('dispute.resolved', {
    dispute_id: id,
    transaction_id: dispute.transaction_id,
    resolution
  });

  return reply.send({ message: 'Dispute resolved' });
});

// Start
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3004, host: '0.0.0.0' });
    await startConsumers();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
