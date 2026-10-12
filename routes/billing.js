const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/invoices', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT i.invoice_id AS id, i.total, i.status, i.issued_at AS issuedAt,
      CONCAT(p.first_name, ' ', p.last_name) AS patient FROM invoices i JOIN patients p ON p.id = i.patient_id
      ORDER BY i.issued_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;