// ===============================
// Garage SaaS Backend - server.js
// ===============================

require('dotenv').config();

// ---------- Imports ----------
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// ---------- App Init ----------
const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json());

// ---------- PostgreSQL Pool ----------
const pool = new Pool({
  host: 'localhost',
  user: 'garage_saas_user',
  password: 'sul1984',
  database: 'garage_saas',
  port: 5432
});

// ---------- Test DB ----------
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL successfully.'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));

// ---------- Health Check ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Garage SaaS backend is running' });
});

// ---------- REGISTER ----------
app.post('/api/auth/register', async (req, res) => {
  const { garage_name, owner_name, email, phone, password } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO garages (garage_name, owner_name, email, phone, password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING garage_id, email`,
      [garage_name, owner_name, email, phone, hashed]
    );

    res.json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      garage: result.rows[0]
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ---------- LOGIN ----------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT garage_id, garage_name, owner_name, email, phone,
              password, first_login_at, subscription_expiry
       FROM garages
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'المستخدم غير موجود' });

    const garage = result.rows[0];

    const ok = await bcrypt.compare(password, garage.password);
    if (!ok)
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });

    const now = new Date();

    if (!garage.first_login_at) {
      const start = now;
      const end = new Date();
      end.setDate(start.getDate() + 30);

      await pool.query(
        `UPDATE garages SET first_login_at=$1, subscription_expiry=$2 WHERE garage_id=$3`,
        [start, end, garage.garage_id]
      );

      garage.first_login_at = start;
      garage.subscription_expiry = end;
    } else {
      const expiry = new Date(garage.subscription_expiry);
      if (now > expiry)
        return res.status(403).json({ error: 'انتهت فترة الاشتراك' });
    }

    const token = jwt.sign(
      { garageId: garage.garage_id, email: garage.email },
      'garage-secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      garage: {
        garage_id: garage.garage_id,
        garage_name: garage.garage_name,
        owner_name: garage.owner_name,
        email: garage.email,
        phone: garage.phone
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error while logging in' });
  }
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Garage SaaS backend listening on port ${PORT}`);
});
