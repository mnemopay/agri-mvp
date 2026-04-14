exports.up = function (knex) {
  return knex.schema.createTable('weather_features', (table) => {
    table.string('id').primary();
    table.string('region').notNullable();
    table.float('latitude').notNullable();
    table.float('longitude').notNullable();
    table.timestamp('forecast_time').notNullable();
    table.float('temp_avg');
    table.float('temp_min');
    table.float('temp_max');
    table.float('humidity_avg');
    table.float('wind_speed_avg');
    table.float('rain_prob');
    table.float('cloud_cover_avg');
    table.string('source').defaultTo('OPENWEATHER_FORECAST');
    table.timestamps(true, true);

    table.unique(
      ['region', 'latitude', 'longitude', 'forecast_time'],
      { indexName: 'weather_features_unique' }
    );
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('weather_features');
};
