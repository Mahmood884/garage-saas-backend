const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// جلب المراحل لسيارة
router.get('/cars/:id/phases', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const carCheck = await pool.query(
      `SELECT car_id FROM cars WHERE car_id = $1 AND garage_id = $2`,
      [id, req.user.garageId]
    );
    if (carCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const result = await pool.query(
      `SELECT * FROM repair_phases
       WHERE car_id = $1
       ORDER BY phase_id`,
      [id]
    );

    res.json({ phases: result.rows });
  } catch (err) {
    console.error('Get phases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// إضافة مرحلة جديدة
router.post(
  '/cars/:id/phases',
  authenticateToken,
  [body('phase_name').notEmpty()],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { phase_name, phase_description, technician_notes } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const carCheck = await pool.query(
        `SELECT car_id FROM cars WHERE car_id = $1 AND garage_id = $2`,
        [id, req.user.garageId]
      );
      if (carCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Car not found' });
      }

      const result = await pool.query(
        `INSERT INTO repair_phases
          (car_id, phase_name, phase_description, technician_notes, status, start_date)
         VALUES ($1,$2,$3,$4,'in_progress',CURRENT_TIMESTAMP)
         RETURNING *`,
        [id, phase_name, phase_description || null, technician_notes || null]
      );

      res.status(201).json({ phase: result.rows[0] });
    } catch (err) {
      console.error('Add phase error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
