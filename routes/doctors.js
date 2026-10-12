const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');
const router = express.Router();

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