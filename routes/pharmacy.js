const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/inventory', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT medication_id AS id, medication_name AS name, dosage,
      stock_quantity AS stock, reorder_level AS reorderLevel, unit_price AS unitPrice, expiry_date AS expiryDate,
      CASE WHEN stock_quantity <= reorder_level THEN 'Low stock' WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      THEN 'Expiring soon' ELSE 'In stock' END AS alert FROM pharmacy_inventory ORDER BY stock_quantity ASC`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;