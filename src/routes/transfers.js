const express = require('express');
const router = express.Router();
const { transferMoney } = require('../controllers/transferController');

router.post('/', transferMoney);

module.exports = router;
