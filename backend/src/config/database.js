// src/config/database.js
const sql = require('mssql');
const logger = require('../utils/logger');

const config = {
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

const connectDB = async () => {
  try {
    if (pool) {
      return pool;
    }
    
    logger.info('Connecting to Azure SQL Database...');
    pool = await sql.connect(config);
    
    // Test the connection
    const result = await pool.request().query('SELECT 1 as connected');
    if (result.recordset[0].connected === 1) {
      logger.info('✅ Database connected successfully');
    }
    
    // Handle connection errors
    pool.on('error', (err) => {
      logger.error('Database pool error:', err);
      pool = null;
    });
    
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    
    // Provide specific error guidance
    if (error.code === 'ELOGIN') {
      logger.error('Authentication failed. Check DB_USER and DB_PASSWORD.');
    } else if (error.code === 'ESOCKET') {
      logger.error('Network error. Check DB_HOST and firewall rules.');
    } else if (error.code === 'ENOTOPEN') {
      logger.error('Connection not open. Server may be unavailable.');
    }
    
    throw error;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool;
};

const closeDB = async () => {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database:', error);
  }
};

// Transaction helper
const withTransaction = async (callback) => {
  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  sql,
  connectDB,
  getPool,
  closeDB,
  withTransaction,
  config,
};
