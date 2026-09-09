const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');

// Batch CRUD
router.post('/batches', batchController.createBatch);
router.get('/batches', batchController.getAllBatches);
router.get('/batches/:id', batchController.getBatchById);
router.put('/batches/:id', batchController.updateBatch);

// Population logging
router.post('/batches/:batch_id/population', batchController.logPopulation);

module.exports = router;
