const pool = require('../config/db');

exports.createTask = async (req, res) => {
  try {
    const {
      barn_id,
      batch_id,
      title,
      description,
      category,
      priority,
      due_date,
      due_time,
      assigned_to,
      is_recurring,
      recurring_pattern
    } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    if (!title || !due_date) {
      return res.status(400).json({ success: false, message: 'Title and due_date are required' });
    }

    const result = await pool.query(
      `INSERT INTO tasks 
       (barn_id, batch_id, title, description, category, priority, due_date, due_time, assigned_to, created_by, is_recurring, recurring_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [barn_id, batch_id, title, description, category, priority || 'medium', due_date, due_time, assigned_to, user_id, is_recurring || false, recurring_pattern]
    );

    res.status(201).json({ success: true, message: 'Task created', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create task', error: error.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const { barn_id, status, due_date, assigned_to } = req.query;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (barn_id) {
      query += ` AND barn_id = $${paramCount}`;
      params.push(barn_id);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (due_date) {
      query += ` AND due_date = $${paramCount}`;
      params.push(due_date);
      paramCount++;
    }

    if (assigned_to) {
      query += ` AND assigned_to = $${paramCount}`;
      params.push(assigned_to);
    }

    query += ' ORDER BY due_date ASC, priority DESC';

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch tasks', error: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowed = ['title', 'description', 'category', 'priority', 'status', 'due_date', 'due_time', 'assigned_to'];
    for (const field of allowed) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update task', error: error.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { completion_notes, time_spent_minutes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    const result = await pool.query(
      `UPDATE tasks 
       SET status = 'completed', 
           completed_at = NOW(), 
           completed_by = $1, 
           completion_notes = $2,
           time_spent_minutes = $3,
           updated_at = NOW()
       WHERE id = $4 
       RETURNING *`,
      [user_id, completion_notes, time_spent_minutes, id]
    );

    res.status(200).json({ success: true, message: 'Task completed', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to complete task', error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete task', error: error.message });
  }
};

exports.getTaskSummary = async (req, res) => {
  try {
    const { barn_id } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'completed' AND DATE(completed_at) = $1) as completed_today,
        COUNT(*) FILTER (WHERE status = 'pending' AND due_date < $1) as overdue_tasks,
        COUNT(*) FILTER (WHERE due_date = $1) as due_today
      FROM tasks WHERE 1=1
    `;
    const params = [today];

    if (barn_id) {
      query += ' AND barn_id = $2';
      params.push(barn_id);
    }

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch task summary', error: error.message });
  }
};
