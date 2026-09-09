const pool = require('../config/db');

exports.logProduction = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const {
      log_date,
      eggs_collected,
      average_weight,
      feed_consumed_kg,
      water_consumed_liters,
      bird_count,
      notes
    } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    if (!log_date || !bird_count) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Calculate FCR if weight data available
    let fcr = null;
    if (feed_consumed_kg && average_weight) {
      const prevWeight = await pool.query(
        'SELECT average_weight FROM production_logs WHERE batch_id = $1 AND log_date < $2 ORDER BY log_date DESC LIMIT 1',
        [batch_id, log_date]
      );
      if (prevWeight.rows.length > 0) {
        const weight_gain = (average_weight - prevWeight.rows[0].average_weight) * bird_count;
        fcr = weight_gain > 0 ? (feed_consumed_kg / weight_gain).toFixed(2) : null;
      }
    }

    // Calculate production rate for layers
    let production_rate = null;
    if (eggs_collected && bird_count) {
      production_rate = ((eggs_collected / bird_count) * 100).toFixed(2);
    }

    const result = await pool.query(
      `INSERT INTO production_logs 
       (batch_id, log_date, eggs_collected, average_weight, feed_consumed_kg, water_consumed_liters, bird_count, fcr, production_rate, notes, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (batch_id, log_date) 
       DO UPDATE SET eggs_collected = EXCLUDED.eggs_collected, average_weight = EXCLUDED.average_weight, feed_consumed_kg = EXCLUDED.feed_consumed_kg
       RETURNING *`,
      [batch_id, log_date, eggs_collected, average_weight, feed_consumed_kg, water_consumed_liters, bird_count, fcr, production_rate, notes, user_id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log production', error: error.message });
  }
};

exports.getProductionLogs = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { limit = 30 } = req.query;

    const result = await pool.query(
      'SELECT * FROM production_logs WHERE batch_id = $1 ORDER BY log_date DESC LIMIT $2',
      [batch_id, limit]
    );

    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch production logs', error: error.message });
  }
};

exports.getProductionMetrics = async (req, res) => {
  try {
    const { batch_id } = req.params;

    const metrics = await pool.query(
      `SELECT 
        AVG(fcr) as avg_fcr,
        AVG(production_rate) as avg_production_rate,
        SUM(eggs_collected) as total_eggs,
        SUM(feed_consumed_kg) as total_feed,
        AVG(average_weight) as avg_weight,
        COUNT(*) as log_count
       FROM production_logs 
       WHERE batch_id = $1`,
      [batch_id]
    );

    res.status(200).json({ success: true, data: metrics.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch metrics', error: error.message });
  }
};
