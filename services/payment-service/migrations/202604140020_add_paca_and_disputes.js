exports.up = function (knex) {
  return knex.schema
    .alterTable('transactions', (table) => {
      table.string('seller_license'); // required if amount > 1343
      table.string('buyer_license');  // required if amount > 1343
      table.string('commodity_description'); // required if amount > 1343
      table.string('usda_grade'); // required if amount > 1343
      table.string('terms_of_sale'); // required if amount > 1343
    })
    .createTable('disputes', (table) => {
      table.string('id').primary();
      table.string('transaction_id').notNullable().references('id').inTable('transactions');
      table
        .enu('reason_code', ['QUALITY', 'QUANTITY', 'LATE_DELIVERY', 'NON_DELIVERY', 'OTHER'])
        .notNullable();
      table.string('opened_by').notNullable(); // buyer_id or farmer_id
      table.string('resolution'); // 'RESOLVED_BUYER' or 'RESOLVED_SELLER'
      table.timestamp('resolved_at');
      table.text('description'); // optional details
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('disputes')
    .alterTable('transactions', (table) => {
      table.dropColumn('seller_license');
      table.dropColumn('buyer_license');
      table.dropColumn('commodity_description');
      table.dropColumn('usda_grade');
      table.dropColumn('terms_of_sale');
    });
};
