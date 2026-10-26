const pool = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

const createAccount = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError('Account name is required and must be a non-empty string', 400);
    }

    const result = await pool.query(
      'INSERT INTO accounts (name) VALUES ($1) RETURNING id, name, balance, created_at',
      [name.trim()]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        balance: parseFloat(result.rows[0].balance),
        created_at: result.rows[0].created_at
      }
    });
  } catch (err) {
    next(err);
  }
};

const getBalance = async (req, res, next) => {
  try {
    const { accountId } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountId)) {
      throw new AppError('Invalid account ID format', 400);
    }

    const result = await pool.query(
      'SELECT id, name, balance FROM accounts WHERE id = $1',
      [accountId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Account not found', 404);
    }

    res.json({
      success: true,
      data: {
        account_id: result.rows[0].id,
        name: result.rows[0].name,
        balance: parseFloat(result.rows[0].balance)
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createAccount, getBalance };
