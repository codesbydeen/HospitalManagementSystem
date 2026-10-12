const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');
const router = express.Router();

router.post('/inventory', requireAdmin, [
  body('name').isString().trim().isLength({ min: 1, max: 160 }),
  body('dosage').isString().trim().isLength({ min: 1, max: 80 }),
  body('stock').isInt({ min: 0, max: 4294967295 }).toInt(),
  body('reorderLevel').isInt({ min: 0, max: 4294967295 }).toInt(),
  body('unitPrice').isFloat({ min: 0, max: 99999999.99 }).toFloat(),
  body('expiryDate').isString().isDate({ format: 'YYYY-MM-DD', strictMode: true })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Check the medication details and try again', details: errors.array() });
  }
  try {
    const [result] = await pool.execute(`INSERT INTO pharmacy_inventory
      (medication_name, dosage, stock_quantity, reorder_level, unit_price, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?)`, [req.body.name, req.body.dosage, req.body.stock,
      req.body.reorderLevel, req.body.unitPrice, req.body.expiryDate]);
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return next(error);
  }
});

router.get('/inventory', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT medication_id AS id, medication_name AS name, dosage,
      stock_quantity AS stock, reorder_level AS reorderLevel, unit_price AS unitPrice, expiry_date AS expiryDate,
      CASE WHEN stock_quantity <= reorder_level THEN 'Low stock' WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      THEN 'Expiring soon' ELSE 'In stock' END AS alert FROM pharmacy_inventory ORDER BY stock_quantity ASC`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;