require('dotenv').config();
const pool = require('../config/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id UUID NOT NULL REFERENCES accounts(id),
        type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
        amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
        description TEXT,
        reference_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, reference_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_account_id
      ON transactions(account_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at
      ON transactions(created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_type
      ON transactions(type)
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
