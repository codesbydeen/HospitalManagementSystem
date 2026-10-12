const express = require('express');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

router.get('/invoices', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT i.invoice_id AS id,
      CONCAT('INV-', LPAD(i.invoice_id, 5, '0')) AS invoiceNumber,
      i.total, i.status, i.issued_at AS issuedAt,
      CONCAT(p.first_name, ' ', p.last_name) AS patient FROM invoices i
      JOIN patients p ON p.id = i.patient_id ORDER BY i.issued_at DESC`);
    const [[totals]] = await pool.query(`SELECT
      COALESCE(SUM(CASE WHEN status = 'Paid'
        AND issued_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN total ELSE 0 END), 0) AS collectedThisMonth,
      COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN total ELSE 0 END), 0) AS outstanding,
      SUM(status = 'Unpaid') AS outstandingCount
      FROM invoices`);
    res.json({ invoices: rows, totals });
  } catch (error) { next(error); }
});

router.get('/mine', requirePatient, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT i.invoice_id AS id,
      CONCAT('INV-', LPAD(i.invoice_id, 5, '0')) AS invoiceNumber,
      i.total, i.status, i.issued_at AS issuedAt, a.department
      FROM invoices i LEFT JOIN appointments a ON a.id = i.appointment_id
      WHERE i.patient_id = ? ORDER BY i.issued_at DESC`, [req.patient.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;