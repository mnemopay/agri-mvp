exports.up = function (knex) {
  return knex.schema.createTable('price_history', (table) => {
    table.string('id').primary();
    table.string('crop_type').notNullable();
    table.string('region').notNullable(); // e.g., Dallas, TX
    table.date('date').notNullable();
    table.float('price').notNullable();
    table.string('source').defaultTo('USDA_AMS');
    table.timestamps(true, true);

    table.unique(['crop_type', 'region', 'date'], { indexName: 'price_history_unique' });
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('price_history');
};
