const express = require('express');
const router = express.Router();
const { createAccount, getBalance } = require('../controllers/accountController');

router.post('/', createAccount);
router.get('/:accountId/balance', getBalance);

module.exports = router;
