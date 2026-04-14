exports.up = function (knex) {
  return knex.schema.alterTable('listings', (table) => {
    table.float('latitude');
    table.float('longitude');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('listings', (table) => {
    table.dropColumn('latitude');
    table.dropColumn('longitude');
  });
};
