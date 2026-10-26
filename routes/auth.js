const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const {
  clearSessionCookie,
  createDoctorSession,
  createSession,
  hashToken,
  requireAuthenticated,
  sessionToken
} = require('../middleware/patient-session');

const router = express.Router();
const registrationRules = [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }),
  body('phone').trim().isLength({ min: 7, max: 30 }),
  body('dob').isISO8601({ strict: true, strictSeparator: true })
];

router.post('/register', registrationRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Check the highlighted details and try again', details: errors.array() });
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const recordNumber = `CF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const [result] = await pool.execute(`INSERT INTO patients
      (medical_record_number, first_name, last_name, email, password_hash, phone, dob, sex)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [recordNumber, req.body.firstName, req.body.lastName,
      req.body.email, passwordHash, req.body.phone, req.body.dob, req.body.sex || 'Prefer not to say']);
    await createSession(result.insertId, res);
    return res.status(201).json({ success: true, session: { id: result.insertId, firstName: req.body.firstName, lastName: req.body.lastName, role: 'patient' } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists' });
    return next(error);
  }
});

router.post('/login', [body('email').trim().isEmail().normalizeEmail(), body('password').isString().isLength({ min: 1, max: 72 })], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid email address and password' });
  try {
    const [rows] = await pool.execute(`SELECT id, first_name AS firstName, last_name AS lastName, email,
      password_hash AS passwordHash, role
      FROM patients WHERE email = ? LIMIT 1`, [req.body.email]);
    const patient = rows[0];
    if (patient?.passwordHash && await bcrypt.compare(req.body.password, patient.passwordHash)) {
      if (!['patient', 'admin'].includes(patient.role)) {
        return res.status(403).json({ error: 'Your account role is missing or invalid. Contact an administrator.' });
      }
      await createSession(patient.id, res);
      return res.json({ success: true, session: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, role: patient.role } });
    }

    const [doctorRows] = await pool.execute(`SELECT d.doctor_id AS id, d.first_name AS firstName,
      d.last_name AS lastName, a.password_hash AS passwordHash
      FROM doctor_accounts a JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE a.email = ? AND d.is_active = TRUE LIMIT 1`, [req.body.email]);
    const doctor = doctorRows[0];
    if (!doctor?.passwordHash || !await bcrypt.compare(req.body.password, doctor.passwordHash)) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }
    await createDoctorSession(doctor.id, res);
    return res.json({ success: true, session: { id: doctor.id, firstName: doctor.firstName, lastName: doctor.lastName, role: 'doctor' } });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuthenticated, async (req, res, next) => {
  const token = sessionToken(req);
  try {
    await pool.execute('DELETE FROM patient_sessions WHERE token_hash = ?', [hashToken(token)]);
    await pool.execute('DELETE FROM doctor_sessions WHERE token_hash = ?', [hashToken(token)]);
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/session', requireAuthenticated, (req, res) => {
  const { id, firstName, lastName, role } = req.auth;
  res.json({ success: true, session: { id, firstName, lastName, role } });
});

module.exports = router;