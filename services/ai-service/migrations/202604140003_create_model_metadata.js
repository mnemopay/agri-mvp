exports.up = function (knex) {
  return knex.schema.createTable('model_metadata', (table) => {
    table.string('id').primary();
    table.string('crop_type').notNullable();
    table.string('region').notNullable();
    table.string('model_path').notNullable(); // points to /models file
    table.timestamp('trained_at').notNullable();
    table.integer('history_points').defaultTo(0);
    table.string('status').defaultTo('TRAINED'); // TRAINED, ERROR
    table.timestamps(true, true);

    table.unique(['crop_type', 'region'], { indexName: 'model_metadata_unique' });
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('model_metadata');
};
