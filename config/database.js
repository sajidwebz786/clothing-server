const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
const sslModeRequired = databaseUrl && /[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(databaseUrl);
const useSsl = process.env.DB_SSL === 'true'
  || (process.env.DB_SSL !== 'false' && sslModeRequired);

const options = {
  dialect: 'postgres',
  logging: false,
  dialectOptions: useSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    : {},
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// Render supplies its PostgreSQL credentials as one URL. Keep the individual
// DB_* settings for local development and other hosting providers.
const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, options)
  : new Sequelize(
      process.env.DB_NAME || 'wildzocdb',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASS || 'niavoit',
      {
        ...options,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432
      }
    );

module.exports = sequelize;
