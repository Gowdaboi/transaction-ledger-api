const express = require('express');
const router = express.Router();
const { addTransaction, getTransactions } = require('../controllers/transactionController');

router.post('/:accountId/transactions', addTransaction);
router.get('/:accountId/transactions', getTransactions);

module.exports = router;
