const pool = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const addTransaction = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { accountId } = req.params;
    const { type, amount, description, reference_id } = req.body;

    // Validate account ID format
    if (!UUID_REGEX.test(accountId)) {
      throw new AppError('Invalid account ID format', 400);
    }

    // Validate type
    if (!type || !['credit', 'debit'].includes(type)) {
      throw new AppError('Transaction type must be either "credit" or "debit"', 400);
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new AppError('Amount must be a number greater than 0', 400);
    }

    // Validate reference_id
    if (!reference_id || typeof reference_id !== 'string' || reference_id.trim().length === 0) {
      throw new AppError('reference_id is required and must be a non-empty string', 400);
    }

    await client.query('BEGIN');

    // Check account exists and lock the row for update
    const accountResult = await client.query(
      'SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE',
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      throw new AppError('Account not found', 404);
    }

    const currentBalance = parseFloat(accountResult.rows[0].balance);

    // Check for duplicate reference_id
    const duplicateCheck = await client.query(
      'SELECT id FROM transactions WHERE account_id = $1 AND reference_id = $2',
      [accountId, reference_id.trim()]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: {
          message: 'A transaction with this reference_id already exists for this account',
          existing_transaction_id: duplicateCheck.rows[0].id
        }
      });
    }

    // Check sufficient balance for debit
    if (type === 'debit' && currentBalance < parsedAmount) {
      throw new AppError(
        `Insufficient balance. Current balance: ${currentBalance}, requested debit: ${parsedAmount}`,
        422
      );
    }

    // Calculate new balance
    const newBalance = type === 'credit'
      ? currentBalance + parsedAmount
      : currentBalance - parsedAmount;

    // Insert transaction
    const txResult = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, type, amount, description, reference_id, created_at`,
      [accountId, type, parsedAmount, description || null, reference_id.trim()]
    );

    // Update account balance
    await client.query(
      'UPDATE accounts SET balance = $1 WHERE id = $2',
      [newBalance, accountId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        id: txResult.rows[0].id,
        account_id: txResult.rows[0].account_id,
        type: txResult.rows[0].type,
        amount: parseFloat(txResult.rows[0].amount),
        description: txResult.rows[0].description,
        reference_id: txResult.rows[0].reference_id,
        created_at: txResult.rows[0].created_at,
        balance_after: newBalance
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { type, page = 1, limit = 10 } = req.query;

    // Validate account ID format
    if (!UUID_REGEX.test(accountId)) {
      throw new AppError('Invalid account ID format', 400);
    }

    // Validate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      throw new AppError('Page must be a positive integer', 400);
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new AppError('Limit must be a positive integer between 1 and 100', 400);
    }

    // Validate type filter
    if (type && !['credit', 'debit'].includes(type)) {
      throw new AppError('Filter type must be either "credit" or "debit"', 400);
    }

    // Check account exists
    const accountResult = await pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      throw new AppError('Account not found', 404);
    }

    const offset = (pageNum - 1) * limitNum;

    // Build query with optional type filter
    let countQuery = 'SELECT COUNT(*) FROM transactions WHERE account_id = $1';
    let dataQuery = `SELECT id, account_id, type, amount, description, reference_id, created_at
                     FROM transactions WHERE account_id = $1`;
    const params = [accountId];

    if (type) {
      countQuery += ' AND type = $2';
      dataQuery += ' AND type = $2';
      params.push(type);
    }

    dataQuery += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);

    const countResult = await pool.query(countQuery, params);
    const totalRecords = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalRecords / limitNum);

    const dataResult = await pool.query(dataQuery, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: dataResult.rows.map(row => ({
        ...row,
        amount: parseFloat(row.amount)
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total_records: totalRecords,
        total_pages: totalPages
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { addTransaction, getTransactions };
