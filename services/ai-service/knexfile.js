require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'password',
    database: 'ai_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  },
  migrations: {
    directory: './migrations'
  }
};
