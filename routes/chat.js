const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const ChatbotService = require('../services/chatbotService');

const router = express.Router();

// قائمة المحادثات للورشة
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
              cust.customer_name,
              car.car_number,
              car.car_model,
              COUNT(m.message_id) AS message_count
       FROM conversations c
       LEFT JOIN customers cust ON c.customer_id = cust.customer_id
       LEFT JOIN cars car ON c.car_id = car.car_id
       LEFT JOIN messages m ON c.conversation_id = m.conversation_id
       WHERE c.garage_id = $1
       GROUP BY c.conversation_id, cust.customer_name, car.car_number, car.car_model
       ORDER BY c.last_message DESC`,
      [req.user.garageId]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// رسائل محادثة معينة
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const convCheck = await pool.query(
      `SELECT conversation_id FROM conversations WHERE conversation_id = $1 AND garage_id = $2`,
      [id, req.user.garageId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await pool.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// إرسال رسالة من الورشة
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message_text } = req.body;

    const convCheck = await pool.query(
      `SELECT conversation_id FROM conversations WHERE conversation_id = $1 AND garage_id = $2`,
      [id, req.user.garageId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, message_text)
       VALUES ($1,'garage',$2)
       RETURNING *`,
      [id, message_text]
    );

    await pool.query(
      `UPDATE conversations SET last_message = CURRENT_TIMESTAMP WHERE conversation_id = $1`,
      [id]
    );

    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * نقطة دخول البوت – هذه يمكن استخدامها من واجهات عامة (WhatsApp Gateway, Telegram Bot, Web Chat, ...)
 * لا تتطلب JWT لأنها موجهة للعميل.
 */
router.post('/chatbot/message', async (req, res) => {
  try {
    const { message, customer_phone, car_id, garage_id } = req.body;
    const chatbot = new ChatbotService();

    let carInfo = null;

    if (car_id) {
      const carRes = await pool.query(
        `SELECT * FROM cars WHERE car_id = $1`,
        [car_id]
      );
      if (carRes.rows.length > 0) {
        carInfo = carRes.rows[0];
      }
    }

    const response = await chatbot.handleCustomerQuery(message, customer_phone, carInfo);

    // إنشاء محادثة لو لم تكن موجودة
    let conversationId = req.body.conversation_id;

    if (!conversationId) {
      let customerId = null;

      if (customer_phone) {
        const custRes = await pool.query(
          `SELECT customer_id FROM customers WHERE phone = $1`,
          [customer_phone]
        );
        if (custRes.rows.length > 0) {
          customerId = custRes.rows[0].customer_id;
        }
      }

      const convRes = await pool.query(
        `INSERT INTO conversations (garage_id, customer_id, car_id, status)
         VALUES ($1,$2,$3,'active')
         RETURNING conversation_id`,
        [garage_id || null, customerId, car_id || null]
      );
      conversationId = convRes.rows[0].conversation_id;
    }

    // حفظ رسالة العميل
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, message_text)
       VALUES ($1,'customer',$2)`,
      [conversationId, message]
    );

    // حفظ رد البوت
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, message_text, is_bot_escalated)
       VALUES ($1,'bot',$2,$3)`,
      [conversationId, response.message, response.needsHuman]
    );

    await pool.query(
      `UPDATE conversations SET last_message = CURRENT_TIMESTAMP WHERE conversation_id = $1`,
      [conversationId]
    );

    res.json({
      success: true,
      response: response.message,
      conversation_id: conversationId,
      needs_human: response.needsHuman
    });
  } catch (err) {
    console.error('Chatbot route error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

