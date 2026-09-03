const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const router = express.Router();

const patientRules = [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('dateOfBirth').isISO8601(),
  body('sex').isIn(['Female', 'Male', 'Other', 'Prefer not to say']),
  body('phone').trim().isLength({ min: 7, max: 30 }),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail()
];

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT patient_id AS id, medical_record_number AS recordNumber,
      CONCAT(first_name, ' ', last_name) AS name, date_of_birth AS dateOfBirth, phone, email,
      created_at AS createdAt FROM Patients ORDER BY created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/', patientRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const recordNumber = `CF-${Date.now().toString(36).toUpperCase()}`;
    const [result] = await pool.execute(`INSERT INTO Patients
      (medical_record_number, first_name, last_name, date_of_birth, sex, phone, email, address, medical_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [recordNumber, req.body.firstName, req.body.lastName,
      req.body.dateOfBirth, req.body.sex, req.body.phone, req.body.email || null,
      req.body.address || null, req.body.medicalHistory || null]);
    res.status(201).json({ id: result.insertId, recordNumber });
  } catch (error) { next(error); }
});

module.exports = router;