const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT doctor_id AS id, CONCAT('Dr. ', first_name, ' ', last_name) AS name,
      specialty, availability_schedule AS availability FROM Doctors WHERE is_active = TRUE ORDER BY last_name`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;