const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// قائمة السيارات للورشة
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT car.*
       FROM cars car
       WHERE car.garage_id = $1
       ORDER BY car.created_at DESC`,
      [req.user.garageId]
    );
    res.json({ cars: result.rows });
  } catch (err) {
    console.error('Get cars error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// إضافة سيارة جديدة
router.post(
  '/',
  authenticateToken,
  [
    body('car_number').notEmpty(),
    body('car_model').notEmpty(),
    body('owner_name').notEmpty(),
    body('owner_phone').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        car_number,
        chassis_number,
        car_model,
        car_color,
        owner_name,
        owner_phone,
        initial_diagnosis,
        customer_id
      } = req.body;

      const result = await pool.query(
        `INSERT INTO cars
          (garage_id, customer_id, car_number, chassis_number, car_model, car_color,
           owner_name, owner_phone, initial_diagnosis, status, current_phase)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'قيد الاستقبال','استقبال')
         RETURNING *`,
        [
          req.user.garageId,
          customer_id || null,
          car_number,
          chassis_number || null,
          car_model,
          car_color || null,
          owner_name,
          owner_phone,
          initial_diagnosis || null
        ]
      );

      res.status(201).json({ car: result.rows[0] });
    } catch (err) {
      console.error('Add car error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// تفاصيل سيارة + قطع الغيار
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const carResult = await pool.query(
      `SELECT * FROM cars
       WHERE car_id = $1 AND garage_id = $2`,
      [id, req.user.garageId]
    );

    if (carResult.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const partsResult = await pool.query(
      `SELECT * FROM spare_parts
       WHERE car_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ car: carResult.rows[0], parts: partsResult.rows });
  } catch (err) {
    console.error('Get car details error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// تحديث حالة السيارة
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await pool.query(
      `UPDATE cars
       SET status = $1
       WHERE car_id = $2 AND garage_id = $3`,
      [status, id, req.user.garageId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update car status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// إضافة قطعة غيار
router.post('/:id/parts', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity } = req.body;

    const carCheck = await pool.query(
      `SELECT car_id FROM cars WHERE car_id = $1 AND garage_id = $2`,
      [id, req.user.garageId]
    );
    if (carCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const result = await pool.query(
      `INSERT INTO spare_parts (car_id, part_name, price, quantity)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [id, name, price, quantity]
    );

    // تحديث إجمالي قطع الغيار في جدول السيارات
    await pool.query(
      `UPDATE cars
       SET parts_total = COALESCE(parts_total,0) + ($1 * $2),
           total_cost  = COALESCE(labor_cost,0) + COALESCE(parts_total,0) + ($1 * $2)
       WHERE car_id = $3`,
      [price, quantity, id]
    );

    res.status(201).json({ part: result.rows[0] });
  } catch (err) {
    console.error('Add part error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
