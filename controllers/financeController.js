const pool = require('../config/db');

exports.addIncome = async (req, res) => {
  try {
    const { barn_id, batch_id, income_date, income_type, quantity, unit_price, total_amount, buyer_name, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    const result = await pool.query(
      `INSERT INTO income_records 
       (barn_id, batch_id, income_date, income_type, quantity, unit_price, total_amount, buyer_name, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [barn_id, batch_id, income_date, income_type, quantity, unit_price, total_amount, buyer_name, notes, user_id]
    );

    res.status(201).json({ success: true, message: 'Income added', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add income', error: error.message });
  }
};

exports.addExpense = async (req, res) => {
  try {
    const { barn_id, batch_id, expense_date, expense_category, item_name, quantity, unit_price, total_amount, supplier, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    const result = await pool.query(
      `INSERT INTO expense_records 
       (barn_id, batch_id, expense_date, expense_category, item_name, quantity, unit_price, total_amount, supplier, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [barn_id, batch_id, expense_date, expense_category, item_name, quantity, unit_price, total_amount, supplier, notes, user_id]
    );

    res.status(201).json({ success: true, message: 'Expense added', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add expense', error: error.message });
  }
};

exports.getFinancialSummary = async (req, res) => {
  try {
    const { barn_id, batch_id, start_date, end_date } = req.query;

    let incomeQuery = 'SELECT COALESCE(SUM(total_amount), 0) as total_income FROM income_records WHERE 1=1';
    let expenseQuery = 'SELECT COALESCE(SUM(total_amount), 0) as total_expense FROM expense_records WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (barn_id) {
      incomeQuery += ` AND barn_id = $${paramCount}`;
      expenseQuery += ` AND barn_id = $${paramCount}`;
      params.push(barn_id);
      paramCount++;
    }

    if (batch_id) {
      incomeQuery += ` AND batch_id = $${paramCount}`;
      expenseQuery += ` AND batch_id = $${paramCount}`;
      params.push(batch_id);
      paramCount++;
    }

    if (start_date) {
      incomeQuery += ` AND income_date >= $${paramCount}`;
      expenseQuery += ` AND expense_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      incomeQuery += ` AND income_date <= $${paramCount}`;
      expenseQuery += ` AND expense_date <= $${paramCount}`;
      params.push(end_date);
    }

    const [income, expense] = await Promise.all([
      pool.query(incomeQuery, params),
      pool.query(expenseQuery, params)
    ]);

    const totalIncome = parseFloat(income.rows[0].total_income);
    const totalExpense = parseFloat(expense.rows[0].total_expense);
    const netProfit = totalIncome - totalExpense;
    const roi = totalExpense > 0 ? ((netProfit / totalExpense) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        total_income: totalIncome,
        total_expense: totalExpense,
        net_profit: netProfit,
        roi_percentage: parseFloat(roi)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch financial summary', error: error.message });
  }
};

exports.getBatchProfitability = async (req, res) => {
  try {
    const { batch_id } = req.params;

    const result = await pool.query('SELECT * FROM batch_profitability WHERE batch_id = $1', [batch_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profitability', error: error.message });
  }
};
exports.getIncome = async (req, res) => {
  try {
    const { barn_id } = req.query;
    let query = 'SELECT * FROM income_records';
    const params = [];
    if (barn_id) {
      query += ' WHERE barn_id = $1';
      params.push(barn_id);
    }
    query += ' ORDER BY income_date DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const { barn_id } = req.query;
    let query = 'SELECT * FROM expense_records';
    const params = [];
    if (barn_id) {
      query += ' WHERE barn_id = $1';
      params.push(barn_id);
    }
    query += ' ORDER BY expense_date DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

