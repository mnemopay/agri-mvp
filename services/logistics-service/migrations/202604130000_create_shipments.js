exports.up = function(knex) {
  return knex.schema
    .createTable('drivers', table => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('vehicle_type').notNullable();
      table.boolean('is_available').defaultTo(true);
      table.float('rating').defaultTo(5.0);
      table.specificType('last_location', 'geometry(Point, 4321)');
      table.timestamps(true, true);
    })
    .createTable('shipments', table => {
      table.string('id').primary();
      table.string('listing_id').unique().notNullable();
      table.string('driver_id').references('id').inTable('drivers');
      table.string('status').defaultTo('PENDING'); // PENDING, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, DISPUTED
      table.string('pickup_location');
      table.string('delivery_location');
      table.timestamps(true, true);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('shipments')
    .dropTable('drivers');
};
