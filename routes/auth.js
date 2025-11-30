const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');

const router = express.Router();

/**
 * ملاحظة:
 * نفترض أن جدول garages يحتوي الحقول:
 * garage_id, garage_name, owner_name, email, phone, password,
 * subscription_status, subscription_plan, subscription_expiry, first_login_at, is_active
 */

/**
 * مسار لإنشاء ورشة جديدة (تستخدمه أنت كأدمن مؤقتاً)
 * يمكن لاحقاً قفله أو حمايته بكلمة مرور خاصة.
 */
router.post(
  '/register',
  [
    body('garage_name').notEmpty(),
    body('owner_name').notEmpty(),
    body('email').isEmail(),
    body('phone').notEmpty(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { garage_name, owner_name, email, phone, password } = req.body;

      const exists = await pool.query('SELECT garage_id FROM garages WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم من قبل.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);

      const result = await pool.query(
        `INSERT INTO garages 
          (garage_name, owner_name, email, phone, password, subscription_status, subscription_plan)
         VALUES ($1, $2, $3, $4, $5, 'trial', 'basic')
         RETURNING garage_id, garage_name, owner_name, email, phone`,
        [garage_name, owner_name, email, phone, hashed]
      );

      res.status(201).json({ success: true, garage: result.rows[0] });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * تسجيل الدخول مع منطق الـ 30 يوم من أول دخول
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM garages WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'المستخدم غير موجود' });
    }

    const garage = result.rows[0];

    if (garage.is_active === false) {
      return res.status(403).json({ error: 'الحساب غير مفعل، تواصل مع الإدارة.' });
    }

    const valid = await bcrypt.compare(password, garage.password);
    if (!valid) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }

    const now = new Date();

    // إذا لا يوجد first_login_at ⇒ أول دخول
    if (!garage.first_login_at) {
      const startDate = now;
      const expiryDate = new Date(now.getTime());
      expiryDate.setDate(expiryDate.getDate() + 30); // +30 يوم

      await pool.query(
        `UPDATE garages
         SET first_login_at = $1, subscription_expiry = $2, subscription_status = 'trial'
         WHERE garage_id = $3`,
        [startDate, expiryDate, garage.garage_id]
      );

      garage.first_login_at = startDate;
      garage.subscription_expiry = expiryDate;
      garage.subscription_status = 'trial';
    } else if (garage.subscription_expiry) {
      const expiry = new Date(garage.subscription_expiry);
      if (now > expiry) {
        return res.status(403).json({
          error: 'انتهت فترة الاشتراك (30 يوم). يرجى التواصل للتجديد.',
          expiredAt: garage.subscription_expiry
        });
      }
    }

    const tokenPayload = {
      garageId: garage.garage_id,
      email: garage.email,
      garageName: garage.garage_name
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      token,
      garage: {
        garage_id: garage.garage_id,
        garage_name: garage.garage_name,
        owner_name: garage.owner_name,
        email: garage.email,
        phone: garage.phone,
        subscription_status: garage.subscription_status,
        subscription_expiry: garage.subscription_expiry
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
