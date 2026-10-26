const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');
const router = express.Router();

function isValidSchedule(schedule) {
  if (!schedule || !Array.isArray(schedule.days) || !schedule.days.length
    || schedule.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)
    || new Set(schedule.days).size !== schedule.days.length
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.endTime)
    || !Number.isInteger(schedule.slotMinutes) || schedule.slotMinutes < 15 || schedule.slotMinutes > 120) {
    return false;
  }
  const toMinutes = value => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  return toMinutes(schedule.startTime) < toMinutes(schedule.endTime);
}

router.post('/', requireAdmin, [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('specialty').trim().isLength({ min: 2, max: 120 }),
  body('licenseNumber').trim().isLength({ min: 3, max: 60 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ min: 7, max: 30 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }),
  body('consultationFee').optional().isFloat({ min: 0, max: 99999999.99 }).toFloat(),
  body('availabilitySchedule').optional().custom(isValidSchedule)
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the doctor details and try again', details: errors.array() });
  let connection;
  try {
    connection = await pool.getConnection();
    const [[patientEmail]] = await connection.execute('SELECT id FROM patients WHERE email = ? LIMIT 1', [req.body.email]);
    const [[doctorEmail]] = await connection.execute('SELECT doctor_id FROM doctor_accounts WHERE email = ? LIMIT 1', [req.body.email]);
    if (patientEmail || doctorEmail) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await connection.beginTransaction();
    const [result] = await connection.execute(`INSERT INTO doctors
      (first_name, last_name, specialty, license_number, phone, email, availability_schedule, consultation_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [req.body.firstName, req.body.lastName,
      req.body.specialty, req.body.licenseNumber, req.body.phone || null, req.body.email,
      req.body.availabilitySchedule ? JSON.stringify(req.body.availabilitySchedule) : null,
      req.body.consultationFee ?? 500]);
    await connection.execute(`INSERT INTO doctor_accounts (doctor_id, email, password_hash)
      VALUES (?, ?, ?)`, [result.insertId, req.body.email, passwordHash]);
    await connection.commit();
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A doctor with this license number or email already exists' });
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/:id/account', requireAdmin, [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters', details: errors.array() });
  const doctorId = Number(req.params.id);
  if (!Number.isSafeInteger(doctorId) || doctorId < 1) return res.status(400).json({ error: 'Invalid doctor ID' });

  let connection;
  try {
    connection = await pool.getConnection();
    const [[doctor]] = await connection.execute('SELECT doctor_id FROM doctors WHERE doctor_id = ? LIMIT 1', [doctorId]);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    const [[existingAccount]] = await connection.execute('SELECT doctor_id FROM doctor_accounts WHERE doctor_id = ? LIMIT 1', [doctorId]);
    if (existingAccount) return res.status(409).json({ error: 'This doctor already has a login account' });
    const [[patientEmail]] = await connection.execute('SELECT id FROM patients WHERE email = ? LIMIT 1', [req.body.email]);
    const [[doctorEmail]] = await connection.execute('SELECT doctor_id FROM doctor_accounts WHERE email = ? LIMIT 1', [req.body.email]);
    if (patientEmail || doctorEmail) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await connection.beginTransaction();
    await connection.execute('UPDATE doctors SET email = ? WHERE doctor_id = ?', [req.body.email, doctorId]);
    await connection.execute(`INSERT INTO doctor_accounts (doctor_id, email, password_hash)
      VALUES (?, ?, ?)`, [doctorId, req.body.email, passwordHash]);
    await connection.commit();
    return res.status(201).json({ id: doctorId, role: 'doctor' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists' });
    return next(error);
  } finally {
    connection?.release();
  }
});

router.get('/directory', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT doctor_id AS id,
      CONCAT('Dr. ', first_name, ' ', last_name) AS name, specialty,
      first_name AS firstName, last_name AS lastName,
      license_number AS licenseNumber, phone, email, is_active AS isActive,
      availability_schedule AS availabilitySchedule, consultation_fee AS consultationFee,
      EXISTS (SELECT 1 FROM doctor_accounts a WHERE a.doctor_id = doctors.doctor_id) AS hasAccount
      FROM doctors ORDER BY last_name, first_name`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.patch('/:id/schedule', requireAdmin, [
  body('availabilitySchedule').custom(isValidSchedule),
  body('consultationFee').isFloat({ min: 0, max: 99999999.99 }).toFloat()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid schedule and consultation fee', details: errors.array() });
  const doctorId = Number(req.params.id);
  if (!Number.isSafeInteger(doctorId) || doctorId < 1) return res.status(400).json({ error: 'Invalid doctor ID' });
  try {
    const [result] = await pool.execute(`UPDATE doctors SET availability_schedule = ?, consultation_fee = ?
      WHERE doctor_id = ?`, [JSON.stringify(req.body.availabilitySchedule), req.body.consultationFee, doctorId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/profile', requireAdmin, [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('specialty').trim().isLength({ min: 2, max: 120 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ min: 7, max: 30 }),
  body('isActive').isBoolean().toBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the doctor profile details', details: errors.array() });
  const doctorId = Number(req.params.id);
  if (!Number.isSafeInteger(doctorId) || doctorId < 1) return res.status(400).json({ error: 'Invalid doctor ID' });
  try {
    const [result] = await pool.execute(`UPDATE doctors SET first_name = ?, last_name = ?,
      specialty = ?, phone = ?, is_active = ? WHERE doctor_id = ?`,
    [req.body.firstName, req.body.lastName, req.body.specialty, req.body.phone || null,
      req.body.isActive, doctorId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT doctor_id AS id, CONCAT('Dr. ', first_name, ' ', last_name) AS name,
      specialty FROM doctors WHERE is_active = TRUE ORDER BY last_name, first_name`);
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;