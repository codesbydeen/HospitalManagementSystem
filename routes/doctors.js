const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');
const router = express.Router();

router.post('/', requireAdmin, [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('specialty').trim().isLength({ min: 2, max: 120 }),
  body('licenseNumber').trim().isLength({ min: 3, max: 60 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ min: 7, max: 30 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().normalizeEmail()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the doctor details and try again', details: errors.array() });
  try {
    const [result] = await pool.execute(`INSERT INTO doctors
      (first_name, last_name, specialty, license_number, phone, email)
      VALUES (?, ?, ?, ?, ?, ?)`, [req.body.firstName, req.body.lastName,
      req.body.specialty, req.body.licenseNumber, req.body.phone || null, req.body.email || null]);
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A doctor with this license number already exists' });
    return next(error);
  }
});

router.get('/directory', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT doctor_id AS id,
      CONCAT('Dr. ', first_name, ' ', last_name) AS name, specialty,
      license_number AS licenseNumber, phone, email, is_active AS isActive
      FROM doctors ORDER BY last_name, first_name`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT doctor_id AS id, CONCAT('Dr. ', first_name, ' ', last_name) AS name,
      specialty FROM doctors WHERE is_active = TRUE ORDER BY last_name, first_name`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;