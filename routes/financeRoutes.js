const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');

router.get('/income', financeController.getIncome);
router.get('/expenses', financeController.getExpenses);
router.post('/income', financeController.addIncome);
router.post('/expenses', financeController.addExpense);
router.get('/summary', financeController.getFinancialSummary);
router.get('/batches/:batch_id/profitability', financeController.getBatchProfitability);

module.exports = router;
