exports.up = function(knex) {
  return knex.schema
    .createTable('users', table => {
      table.string('id').primary();
      table.string('username').unique().notNullable();
      table.string('role').notNullable(); // FARMER, BUYER, DRIVER, ADMIN
      table.boolean('is_verified').defaultTo(false);
      table.timestamps(true, true);
    })
    .createTable('listings', table => {
      table.string('id').primary();
      table.string('farmer_id').references('id').inTable('users');
      table.string('crop_type').notNullable();
      table.float('quantity').notNullable();
      table.float('price').notNullable();
      table.float('ai_recommended_price');
      table.string('status').defaultTo('ACTIVE'); // ACTIVE, SOLD, COMPLETED, CANCELLED
      table.string('location');
      table.timestamps(true, true);
    })
    .createTable('bids', table => {
      table.string('id').primary();
      table.string('listing_id').references('id').inTable('listings');
      table.string('buyer_id').references('id').inTable('users');
      table.float('bid_price').notNullable();
      table.string('status').defaultTo('PENDING'); // PENDING, ACCEPTED, REJECTED
      table.timestamps(true, true);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('bids')
    .dropTable('listings')
    .dropTable('users');
};
