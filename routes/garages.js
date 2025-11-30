const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// إرجاع التخصصات للورش
router.get('/garages/specializations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gs.*, g.garage_name
       FROM garage_specializations gs
       LEFT JOIN garages g ON gs.garage_id = g.garage_id
       ORDER BY g.garage_name, gs.is_primary DESC`
    );
    res.json({ specializations: result.rows });
  } catch (err) {
    console.error('Get specializations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
