const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

router.post('/batches/:batch_id/health', healthController.logHealthCheck);
router.get('/batches/:batch_id/health', healthController.getHealthHistory);
router.post('/batches/:batch_id/vaccination', healthController.recordVaccination);
router.get('/batches/:batch_id/vaccination/schedule', healthController.getVaccinationSchedule);
router.get('/vaccinations', healthController.getVaccinations);
router.get('/diseases', healthController.getDiseases);

module.exports = router;
