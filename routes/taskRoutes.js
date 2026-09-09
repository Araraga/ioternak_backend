const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

router.post('/tasks', taskController.createTask);
router.get('/tasks', taskController.getTasks);
router.get('/tasks/summary', taskController.getTaskSummary);
router.put('/tasks/:id', taskController.updateTask);
router.post('/tasks/:id/complete', taskController.completeTask);
router.delete('/tasks/:id', taskController.deleteTask);

module.exports = router;
