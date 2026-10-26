const express = require('express');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

router.get('/invoices', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT i.invoice_id AS id,
      CONCAT('INV-', LPAD(i.invoice_id, 5, '0')) AS invoiceNumber,
      i.total, i.status, i.invoice_type AS invoiceType, i.issued_at AS issuedAt,
      CONCAT(p.first_name, ' ', p.last_name) AS patient FROM invoices i
      JOIN patients p ON p.id = i.patient_id ORDER BY i.issued_at DESC`);
    const [items] = await pool.query(`SELECT ii.invoice_id AS invoiceId, ii.description,
      ii.quantity, ii.unit_price AS unitPrice FROM invoice_items ii
      ORDER BY ii.invoice_id, ii.invoice_item_id`);
    const itemsByInvoice = new Map();
    for (const item of items) {
      if (!itemsByInvoice.has(item.invoiceId)) itemsByInvoice.set(item.invoiceId, []);
      itemsByInvoice.get(item.invoiceId).push(item);
    }
    rows.forEach(invoice => { invoice.items = itemsByInvoice.get(invoice.id) || []; });
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
      i.total, i.status, i.invoice_type AS invoiceType, i.issued_at AS issuedAt, a.department
      FROM invoices i LEFT JOIN appointments a ON a.id = i.appointment_id
      WHERE i.patient_id = ? ORDER BY i.issued_at DESC`, [req.patient.id]);
    const [items] = await pool.execute(`SELECT ii.invoice_id AS invoiceId, ii.description,
      ii.quantity, ii.unit_price AS unitPrice FROM invoice_items ii JOIN invoices i ON i.invoice_id = ii.invoice_id
      WHERE i.patient_id = ? ORDER BY ii.invoice_id, ii.invoice_item_id`, [req.patient.id]);
    const itemsByInvoice = new Map();
    for (const item of items) {
      if (!itemsByInvoice.has(item.invoiceId)) itemsByInvoice.set(item.invoiceId, []);
      itemsByInvoice.get(item.invoiceId).push(item);
    }
    rows.forEach(invoice => { invoice.items = itemsByInvoice.get(invoice.id) || []; });
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.patch('/invoices/:id/status', requireAdmin, async (req, res, next) => {
  const invoiceId = Number(req.params.id);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
    return res.status(400).json({ error: 'Invalid invoice ID' });
  }
  if (!['Paid', 'Void'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Choose Paid or Void as the invoice status' });
  }
  try {
    const [result] = await pool.execute(`UPDATE invoices SET status = ?
      WHERE invoice_id = ? AND status = 'Unpaid'`, [req.body.status, invoiceId]);
    if (!result.affectedRows) {
      return res.status(409).json({ error: 'Invoice was not found or is no longer unpaid' });
    }
    res.json({ status: req.body.status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;