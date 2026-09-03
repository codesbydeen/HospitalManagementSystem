const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT a.appointment_id AS id, a.appointment_at AS appointmentAt,
      a.reason, a.status, a.source, CONCAT(p.first_name, ' ', p.last_name) AS patient,
      CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor, d.specialty
      FROM Appointments a JOIN Patients p ON p.patient_id = a.patient_id
      JOIN Doctors d ON d.doctor_id = a.doctor_id ORDER BY a.appointment_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.patch('/:id/status', body('status').isIn(['Scheduled', 'Checked in', 'Completed', 'Cancelled']), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    await pool.execute('UPDATE Appointments SET status = ? WHERE appointment_id = ?', [req.body.status, req.params.id]);
    res.json({ status: req.body.status });
  } catch (error) { next(error); }
});

module.exports = router;