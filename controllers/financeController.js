const pool = require('../config/db');

// Pemetaan kategori Bahasa Indonesia (dari Flutter UI) ke ENUM / CHECK constraint PostgreSQL
const incomeTypeMap = {
  penjualan_ayam: 'bird_sales',
  ayam: 'bird_sales',
  bird_sales: 'bird_sales',
  penjualan_telur: 'egg_sales',
  telur: 'egg_sales',
  egg_sales: 'egg_sales',
  pupuk_kotoran: 'manure',
  pupuk: 'manure',
  kotoran: 'manure',
  manure: 'manure',
  afkir: 'culled_sales',
  culled_sales: 'culled_sales',
  lainnya: 'other',
  other: 'other'
};

const expenseCategoryMap = {
  pakan: 'feed',
  feed: 'feed',
  bibit_doc: 'doc',
  doc: 'doc',
  bibit: 'doc',
  vaksin_obat: 'medicine',
  vaksin: 'medicine',
  obat: 'medicine',
  medicine: 'medicine',
  tenaga_kerja: 'labor',
  gaji: 'labor',
  labor: 'labor',
  listrik_air: 'utilities',
  listrik: 'utilities',
  air: 'utilities',
  utilities: 'utilities',
  peralatan: 'maintenance',
  pemeliharaan: 'maintenance',
  maintenance: 'maintenance',
  lainnya: 'other',
  other: 'other'
};

exports.addIncome = async (req, res) => {
  try {
    const { barn_id, batch_id, income_date, income_type, quantity, unit_price, total_amount, buyer_name, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    // Normalisasi kategori ke DB CHECK constraint
    const rawType = String(income_type || '').toLowerCase().trim();
    const safeIncomeType = incomeTypeMap[rawType] || 'other';

    let targetBarnId = barn_id;
    if (!targetBarnId || targetBarnId === 'null' || targetBarnId === 'undefined') {
      const defaultBarn = await pool.query('SELECT id FROM barns ORDER BY id ASC LIMIT 1');
      if (defaultBarn.rows.length > 0) targetBarnId = defaultBarn.rows[0].id;
      else targetBarnId = null;
    }

    const safeAmount = Number(total_amount) || 0;
    const safeQty = quantity != null && Number(quantity) > 0 ? Number(quantity) : 1;
    const safePrice = unit_price != null && Number(unit_price) >= 0 ? Number(unit_price) : safeAmount;
    const safeDate = income_date || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `INSERT INTO income_records 
       (barn_id, batch_id, income_date, income_type, quantity, unit_price, total_amount, buyer_name, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [targetBarnId, batch_id || null, safeDate, safeIncomeType, safeQty, safePrice, safeAmount, buyer_name || null, notes || null, user_id || null]
    );

    res.status(201).json({ success: true, message: 'Pemasukan berhasil dicatat', data: result.rows[0] });
  } catch (error) {
    console.error('Error addIncome:', error);
    res.status(500).json({ success: false, message: 'Gagal mencatat pemasukan', error: error.message });
  }
};

exports.addExpense = async (req, res) => {
  try {
    const { barn_id, batch_id, expense_date, expense_category, item_name, quantity, unit_price, total_amount, supplier, notes } = req.body;
    const user_id = req.user?.id || req.body.user_id;

    // Normalisasi kategori ke DB CHECK constraint
    const rawCat = String(expense_category || '').toLowerCase().trim();
    const safeExpenseCat = expenseCategoryMap[rawCat] || 'other';

    let targetBarnId = barn_id;
    if (!targetBarnId || targetBarnId === 'null' || targetBarnId === 'undefined') {
      const defaultBarn = await pool.query('SELECT id FROM barns ORDER BY id ASC LIMIT 1');
      if (defaultBarn.rows.length > 0) targetBarnId = defaultBarn.rows[0].id;
      else targetBarnId = null;
    }

    const safeAmount = Number(total_amount) || 0;
    const safeQty = quantity != null && Number(quantity) > 0 ? Number(quantity) : 1;
    const safePrice = unit_price != null && Number(unit_price) >= 0 ? Number(unit_price) : safeAmount;
    const safeDate = expense_date || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `INSERT INTO expense_records 
       (barn_id, batch_id, expense_date, expense_category, item_name, quantity, unit_price, total_amount, supplier, notes, receipt_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [targetBarnId, batch_id || null, safeDate, safeExpenseCat, item_name || safeExpenseCat, safeQty, safePrice, safeAmount, supplier || null, notes || null, receipt_url || null, user_id || null]
    );

    res.status(201).json({ success: true, message: 'Pengeluaran berhasil dicatat', data: result.rows[0] });
  } catch (error) {
    console.error('Error addExpense:', error);
    res.status(500).json({ success: false, message: 'Gagal mencatat pengeluaran', error: error.message });
  }
};

exports.getFinancialSummary = async (req, res) => {
  try {
    const { barn_id, batch_id, start_date, end_date } = req.query;

    let incomeQuery = 'SELECT COALESCE(SUM(total_amount), 0) as total_income FROM income_records WHERE 1=1';
    let expenseQuery = 'SELECT COALESCE(SUM(total_amount), 0) as total_expense FROM expense_records WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (barn_id && barn_id !== 'null' && barn_id !== 'undefined') {
      incomeQuery += ` AND barn_id = $${paramCount}`;
      expenseQuery += ` AND barn_id = $${paramCount}`;
      params.push(barn_id);
      paramCount++;
    }

    if (batch_id && batch_id !== 'null' && batch_id !== 'undefined') {
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

    const totalIncome = parseFloat(income.rows[0]?.total_income || 0);
    const totalExpense = parseFloat(expense.rows[0]?.total_expense || 0);
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
    console.error('Error getFinancialSummary:', error);
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
    if (barn_id && barn_id !== 'null' && barn_id !== 'undefined') {
      query += ' WHERE barn_id = $1';
      params.push(barn_id);
    }
    query += ' ORDER BY income_date DESC, id DESC LIMIT 50';
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
    if (barn_id && barn_id !== 'null' && barn_id !== 'undefined') {
      query += ' WHERE barn_id = $1';
      params.push(barn_id);
    }
    query += ' ORDER BY expense_date DESC, id DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
