const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// الحصول على بيانات الفاتورة لسيارة
router.get('/cars/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const carRes = await pool.query(
      `SELECT c.*, cust.customer_name, cust.phone, cust.email
       FROM cars c
       LEFT JOIN customers cust ON c.customer_id = cust.customer_id
       WHERE c.car_id = $1 AND c.garage_id = $2`,
      [id, req.user.garageId]
    );
    if (carRes.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const partsRes = await pool.query(
      `SELECT * FROM spare_parts
       WHERE car_id = $1`,
      [id]
    );

    const phasesRes = await pool.query(
      `SELECT * FROM repair_phases
       WHERE car_id = $1`,
      [id]
    );

    const car = carRes.rows[0];

    const invoice = {
      car,
      parts: partsRes.rows,
      phases: phasesRes.rows,
      subtotal: Number(car.parts_total || 0) + Number(car.labor_cost || 0),
      total: Number(car.total_cost || 0)
    };

    res.json({ invoice });
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
