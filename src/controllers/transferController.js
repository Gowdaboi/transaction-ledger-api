const pool = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const transferMoney = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { from_account_id, to_account_id, amount, description, reference_id } = req.body;

    // Validate account IDs
    if (!from_account_id || !UUID_REGEX.test(from_account_id)) {
      throw new AppError('Valid from_account_id is required', 400);
    }
    if (!to_account_id || !UUID_REGEX.test(to_account_id)) {
      throw new AppError('Valid to_account_id is required', 400);
    }
    if (from_account_id === to_account_id) {
      throw new AppError('Cannot transfer to the same account', 400);
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

    // Lock both accounts in a consistent order to prevent deadlocks
    const [firstId, secondId] = from_account_id < to_account_id
      ? [from_account_id, to_account_id]
      : [to_account_id, from_account_id];

    const lockResult = await client.query(
      'SELECT id, name, balance FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR UPDATE',
      [firstId, secondId]
    );

    if (lockResult.rows.length < 2) {
      const foundIds = lockResult.rows.map(r => r.id);
      if (!foundIds.includes(from_account_id)) {
        throw new AppError('Source account not found', 404);
      }
      throw new AppError('Destination account not found', 404);
    }

    const sourceAccount = lockResult.rows.find(r => r.id === from_account_id);
    const destAccount = lockResult.rows.find(r => r.id === to_account_id);
    const sourceBalance = parseFloat(sourceAccount.balance);

    // Check sufficient balance
    if (sourceBalance < parsedAmount) {
      throw new AppError(
        `Insufficient balance in source account. Current balance: ${sourceBalance}, requested transfer: ${parsedAmount}`,
        422
      );
    }

    // Check for duplicate reference_id on source account
    const debitDupCheck = await client.query(
      'SELECT id FROM transactions WHERE account_id = $1 AND reference_id = $2',
      [from_account_id, `transfer-out-${reference_id.trim()}`]
    );
    if (debitDupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: { message: 'A transfer with this reference_id already exists' }
      });
    }

    const transferDesc = description || `Transfer from ${sourceAccount.name} to ${destAccount.name}`;

    // Create debit transaction on source account
    const debitResult = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, 'debit', $2, $3, $4)
       RETURNING id, created_at`,
      [from_account_id, parsedAmount, transferDesc, `transfer-out-${reference_id.trim()}`]
    );

    // Create credit transaction on destination account
    const creditResult = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, 'credit', $2, $3, $4)
       RETURNING id, created_at`,
      [to_account_id, parsedAmount, transferDesc, `transfer-in-${reference_id.trim()}`]
    );

    // Update both balances
    const newSourceBalance = sourceBalance - parsedAmount;
    const newDestBalance = parseFloat(destAccount.balance) + parsedAmount;

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newSourceBalance, from_account_id]);
    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newDestBalance, to_account_id]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        transfer: {
          from_account_id,
          to_account_id,
          amount: parsedAmount,
          description: transferDesc,
          reference_id: reference_id.trim()
        },
        debit_transaction: {
          id: debitResult.rows[0].id,
          created_at: debitResult.rows[0].created_at
        },
        credit_transaction: {
          id: creditResult.rows[0].id,
          created_at: creditResult.rows[0].created_at
        },
        balances: {
          from_account: newSourceBalance,
          to_account: newDestBalance
        }
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { transferMoney };
