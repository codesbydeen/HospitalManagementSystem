const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

router.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT a.id, a.appointment_at AS appointmentAt,
      a.reason, a.status, a.source, CONCAT(p.first_name, ' ', p.last_name) AS patient,
      COALESCE(CONCAT('Dr. ', d.first_name, ' ', d.last_name), 'Care team') AS doctor,
      COALESCE(d.specialty, a.department) AS specialty
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id ORDER BY a.appointment_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/', requirePatient, [
  body('department').trim().isLength({ min: 2, max: 120 }),
  body('preferredDate').isISO8601({ strict: true, strictSeparator: true }),
  body('preferredTime').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('reason').trim().isLength({ min: 3, max: 255 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the appointment details and try again', details: errors.array() });
  try {
    const preferredTime = req.body.preferredTime || '09:00';
    const appointmentAt = `${req.body.preferredDate} ${preferredTime}:00`;
    const [result] = await pool.execute(`INSERT INTO appointments
      (patient_id, department, preferred_date, appointment_at, reason, status, source)
      VALUES (?, ?, ?, ?, ?, 'Pending', 'Online')`, [req.patient.id, req.body.department,
      req.body.preferredDate, appointmentAt, req.body.reason]);
    return res.status(201).json({ success: true, appointment: { id: result.insertId, department: req.body.department, preferredDate: req.body.preferredDate, preferredTime, status: 'Pending' } });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', requireAdmin, body('status').isIn(['Pending', 'Scheduled', 'Checked in', 'Completed', 'Cancelled']), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    await pool.execute('UPDATE appointments SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ status: req.body.status });
  } catch (error) { next(error); }
});

module.exports = router;