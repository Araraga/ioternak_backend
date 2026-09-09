const pool = require('../config/db');

exports.logHealthCheck = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const {
      check_date,
      overall_status,
      sick_birds_count,
      symptoms,
      behavioral_notes,
      actions_taken
    } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    const result = await pool.query(
      `INSERT INTO health_checks 
       (batch_id, check_date, overall_status, sick_birds_count, symptoms, behavioral_notes, actions_taken, checked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [batch_id, check_date || new Date(), overall_status || 'good', sick_birds_count || 0, symptoms, behavioral_notes, actions_taken, user_id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log health check', error: error.message });
  }
};

exports.getHealthHistory = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { limit = 30 } = req.query;

    const result = await pool.query(
      'SELECT * FROM health_checks WHERE batch_id = $1 ORDER BY check_date DESC LIMIT $2',
      [batch_id, limit]
    );

    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch health history', error: error.message });
  }
};

exports.recordVaccination = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const {
      vaccination_id,
      vaccination_name,
      administration_date,
      bird_age_days,
      birds_vaccinated,
      batch_number,
      administered_by,
      method,
      notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO vaccination_records 
       (batch_id, vaccination_id, vaccination_name, administration_date, bird_age_days, birds_vaccinated, batch_number, administered_by, method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [batch_id, vaccination_id, vaccination_name, administration_date, bird_age_days, birds_vaccinated, batch_number, administered_by, method, notes]
    );

    res.status(201).json({ success: true, message: 'Vaccination recorded', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to record vaccination', error: error.message });
  }
};

exports.getVaccinationSchedule = async (req, res) => {
  try {
    const { batch_id } = req.params;

    const batch = await pool.query('SELECT bird_type, start_date FROM bird_batches WHERE id = $1', [batch_id]);
    if (batch.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const vaccinations = await pool.query(
      `SELECT * FROM vaccinations WHERE bird_type IN ('all', $1) ORDER BY recommended_age_days`,
      [batch.rows[0].bird_type]
    );

    const records = await pool.query(
      'SELECT vaccination_id FROM vaccination_records WHERE batch_id = $1',
      [batch_id]
    );
    const completedIds = records.rows.map(r => r.vaccination_id);

    const schedule = vaccinations.rows.map(v => {
      const dueDate = new Date(batch.rows[0].start_date);
      dueDate.setDate(dueDate.getDate() + v.recommended_age_days);
      
      return {
        ...v,
        due_date: dueDate,
        status: completedIds.includes(v.id) ? 'completed' : (dueDate < new Date() ? 'overdue' : 'pending')
      };
    });

    res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch vaccination schedule', error: error.message });
  }
};

exports.getVaccinations = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vaccinations ORDER BY recommended_age_days');
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch vaccinations', error: error.message });
  }
};

exports.getDiseases = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM diseases ORDER BY disease_name');
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch diseases', error: error.message });
  }
};
