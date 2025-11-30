const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// جلب قائمة العملاء للورشة الحالية
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
              COUNT(car.car_id) AS car_count,
              MAX(car.created_at) AS last_visit
       FROM customers c
       LEFT JOIN cars car ON c.customer_id = car.customer_id
       WHERE c.garage_id = $1
       GROUP BY c.customer_id
       ORDER BY COALESCE(MAX(car.created_at), c.created_at) DESC`,
      [req.user.garageId]
    );
    res.json({ customers: result.rows });
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// إضافة عميل جديد
router.post(
  '/',
  authenticateToken,
  [
    body('customer_name').notEmpty(),
    body('phone').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { customer_name, phone, email, address, customer_notes } = req.body;

      const result = await pool.query(
        `INSERT INTO customers (customer_name, phone, email, address, customer_notes, garage_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [customer_name, phone, email || null, address || null, customer_notes || null, req.user.garageId]
      );

      res.status(201).json({ customer: result.rows[0] });
    } catch (err) {
      console.error('Add customer error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// جلب سيارات عميل معين
router.get('/:id/cars', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM cars 
       WHERE customer_id = $1 AND garage_id = $2
       ORDER BY created_at DESC`,
      [id, req.user.garageId]
    );
    res.json({ cars: result.rows });
  } catch (err) {
    console.error('Get customer cars error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
