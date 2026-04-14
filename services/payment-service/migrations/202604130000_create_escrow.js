exports.up = function(knex) {
  return knex.schema
    .createTable('transactions', table => {
      table.string('id').primary();
      table.string('listing_id').notNullable();
      table.string('buyer_id').notNullable();
      table.string('farmer_id').notNullable();
      table.float('amount').notNullable();
      table.string('status').defaultTo('HELD'); // HELD, RELEASED, DISPUTED, REFUNDED
      table.timestamps(true, true);
    });
};

exports.down = function(knex) {
  return knex.schema.dropTable('transactions');
};
