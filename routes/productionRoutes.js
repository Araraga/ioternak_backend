const express = require('express');
const router = express.Router();
const productionController = require('../controllers/productionController');

router.post('/batches/:batch_id/production', productionController.logProduction);
router.get('/batches/:batch_id/production', productionController.getProductionLogs);
router.get('/batches/:batch_id/production/metrics', productionController.getProductionMetrics);

module.exports = router;
