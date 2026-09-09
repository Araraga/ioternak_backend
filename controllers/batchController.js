const pool = require('../config/db');

exports.createBatch = async (req, res) => {
  try {
    const { barn_id, batch_name, bird_type, breed, supplier, initial_count, start_date, target_harvest_date, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    if (!barn_id || !batch_name || !bird_type || !initial_count || !start_date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const batch_code = `BATCH-${Date.now()}-${barn_id}`;
    const result = await pool.query(
      `INSERT INTO bird_batches (barn_id, batch_name, batch_code, bird_type, breed, supplier, initial_count, current_count, start_date, target_harvest_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11) RETURNING *`,
      [barn_id, batch_name, batch_code, bird_type, breed, supplier, initial_count, start_date, target_harvest_date, notes, user_id]
    );

    res.status(201).json({ success: true, message: 'Batch created', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create batch', error: error.message });
  }
};

exports.getAllBatches = async (req, res) => {
  try {
    const { barn_id, status } = req.query;
    let query = 'SELECT * FROM batch_summary WHERE 1=1';
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
    }
    query += ' ORDER BY start_date DESC';

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch batches', error: error.message });
  }
};

exports.getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT bs.*, bp.total_income, bp.total_expense, bp.net_profit, bp.roi_percentage 
       FROM batch_summary bs 
       LEFT JOIN batch_profitability bp ON bp.batch_id = bs.id 
       WHERE bs.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch batch', error: error.message });
  }
};

exports.updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowed = ['batch_name', 'bird_type', 'current_count', 'status', 'notes'];
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
      `UPDATE bird_batches SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`, 
      values
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update batch', error: error.message });
  }
};

exports.logPopulation = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { log_date, bird_count, mortality_count, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    const result = await pool.query(
      `INSERT INTO population_logs (batch_id, log_date, bird_count, mortality_count, notes, logged_by) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (batch_id, log_date) DO UPDATE SET bird_count = EXCLUDED.bird_count 
       RETURNING *`,
      [batch_id, log_date, bird_count, mortality_count || 0, notes, user_id]
    );

    await pool.query('UPDATE bird_batches SET current_count = $1 WHERE id = $2', [bird_count, batch_id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log population', error: error.message });
  }
};
