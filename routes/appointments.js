const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

const isCalendarDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
};

router.get('/availability', async (req, res, next) => {
  const date = req.query.date;
  const specialty = req.query.specialty;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isCalendarDate(date)) {
    return res.status(400).json({ error: 'Choose a valid appointment date' });
  }
  try {
    const [[dateCheck]] = await pool.execute('SELECT ? > CURDATE() AS isFutureDate', [date]);
    if (!dateCheck.isFutureDate) return res.status(400).json({ error: 'Choose a future appointment date' });
    const [doctors] = await pool.execute(`SELECT doctor_id AS id,
      CONCAT('Dr. ', first_name, ' ', last_name) AS name, specialty
      FROM doctors WHERE is_active = TRUE AND (? = '' OR specialty = ?)
      ORDER BY last_name, first_name`, [typeof specialty === 'string' ? specialty : '', typeof specialty === 'string' ? specialty : '']);
    const [booked] = await pool.execute(`SELECT doctor_id AS doctorId,
      TIME_FORMAT(appointment_at, '%H:%i') AS time
      FROM appointments WHERE preferred_date = ? AND doctor_id IS NOT NULL
        AND status NOT IN ('Cancelled')`, [date]);
    const bookedByDoctor = new Map();
    booked.forEach(({ doctorId, time }) => {
      if (!bookedByDoctor.has(doctorId)) bookedByDoctor.set(doctorId, new Set());
      bookedByDoctor.get(doctorId).add(time);
    });
    const times = [];
    for (let minutes = 8 * 60 + 30; minutes < 17 * 60; minutes += 30) {
      times.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
    res.json(doctors.map(doctor => ({
      ...doctor,
      availableTimes: times.filter(time => !bookedByDoctor.get(doctor.id)?.has(time))
    })));
  } catch (error) {
    next(error);
  }
});

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
  body('preferredDate').isString().isISO8601({ strict: true, strictSeparator: true }),
  body('preferredTime').optional().isString().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('doctorId').optional().isInt({ min: 1 }),
  body('reason').trim().isLength({ min: 3, max: 255 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the appointment details and try again', details: errors.array() });
  try {
    const preferredTime = req.body.preferredTime || '09:00';
    const [hour, minute] = preferredTime.split(':').map(Number);
    const minutesSinceMidnight = hour * 60 + minute;
    if (!isCalendarDate(req.body.preferredDate) || minutesSinceMidnight < 8 * 60 + 30
      || minutesSinceMidnight >= 17 * 60 || minutesSinceMidnight % 30 !== 0) {
      return res.status(400).json({ error: 'Choose a future date and an available clinic appointment time' });
    }
    const [[dateCheck]] = await pool.execute('SELECT ? > CURDATE() AS isFutureDate', [req.body.preferredDate]);
    if (!dateCheck.isFutureDate) return res.status(400).json({ error: 'Choose a future appointment date' });
    const appointmentAt = `${req.body.preferredDate} ${preferredTime}:00`;
    let doctorId = null;
    if (req.body.doctorId) {
      const [doctors] = await pool.execute(`SELECT doctor_id FROM doctors
        WHERE doctor_id = ? AND specialty = ? AND is_active = TRUE LIMIT 1`,
      [req.body.doctorId, req.body.department]);
      if (!doctors.length) return res.status(400).json({ error: 'Choose an active clinician for this specialty' });
      const [booked] = await pool.execute(`SELECT id FROM appointments
        WHERE doctor_id = ? AND appointment_at = ? AND status != 'Cancelled' LIMIT 1`,
      [req.body.doctorId, appointmentAt]);
      if (booked.length) return res.status(409).json({ error: 'That appointment time was just taken. Choose another time.' });
      doctorId = doctors[0].doctor_id;
    }
    const [result] = await pool.execute(`INSERT INTO appointments
      (patient_id, doctor_id, department, preferred_date, appointment_at, reason, status, source)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending', 'Online')`, [req.patient.id, doctorId, req.body.department,
      req.body.preferredDate, appointmentAt, req.body.reason]);
    return res.status(201).json({ success: true, appointment: { id: result.insertId, department: req.body.department, preferredDate: req.body.preferredDate, preferredTime, status: 'Pending' } });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin', requireAdmin, [
  body('patientId').isInt({ min: 1 }).toInt(),
  body('doctorId').isInt({ min: 1 }).toInt(),
  body('preferredDate').isString().isISO8601({ strict: true, strictSeparator: true }),
  body('preferredTime').isString().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('reason').isString().trim().isLength({ min: 3, max: 255 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Check the appointment details and try again', details: errors.array() });
  }
  try {
    const [hour, minute] = req.body.preferredTime.split(':').map(Number);
    const minutesSinceMidnight = hour * 60 + minute;
    if (!isCalendarDate(req.body.preferredDate) || minutesSinceMidnight < 8 * 60 + 30
      || minutesSinceMidnight >= 17 * 60 || minutesSinceMidnight % 30 !== 0) {
      return res.status(400).json({ error: 'Choose a future date and an available clinic appointment time' });
    }
    const [[dateCheck]] = await pool.execute('SELECT ? > CURDATE() AS isFutureDate', [req.body.preferredDate]);
    if (!dateCheck.isFutureDate) return res.status(400).json({ error: 'Choose a future appointment date' });

    const [[patient]] = await pool.execute('SELECT id FROM patients WHERE id = ? LIMIT 1', [req.body.patientId]);
    if (!patient) return res.status(400).json({ error: 'Choose an existing patient' });
    const [[doctor]] = await pool.execute(`SELECT doctor_id, specialty FROM doctors
      WHERE doctor_id = ? AND is_active = TRUE LIMIT 1`, [req.body.doctorId]);
    if (!doctor) return res.status(400).json({ error: 'Choose an active doctor' });

    const appointmentAt = `${req.body.preferredDate} ${req.body.preferredTime}:00`;
    const [booked] = await pool.execute(`SELECT id FROM appointments
      WHERE doctor_id = ? AND appointment_at = ? AND status != 'Cancelled' LIMIT 1`,
    [doctor.doctor_id, appointmentAt]);
    if (booked.length) return res.status(409).json({ error: 'That doctor is already booked at this time. Choose another time.' });

    const [result] = await pool.execute(`INSERT INTO appointments
      (patient_id, doctor_id, department, preferred_date, appointment_at, reason, status, source)
      VALUES (?, ?, ?, ?, ?, ?, 'Scheduled', 'Reception')`, [patient.id, doctor.doctor_id,
      doctor.specialty, req.body.preferredDate, appointmentAt, req.body.reason]);
    return res.status(201).json({ id: result.insertId, status: 'Scheduled' });
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