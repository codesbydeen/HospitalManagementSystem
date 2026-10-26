const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

const patientRules = [
  body('firstName').trim().isLength({ min: 2, max: 80 }),
  body('lastName').trim().isLength({ min: 2, max: 80 }),
  body('dateOfBirth').isISO8601(),
  body('sex').isIn(['Female', 'Male', 'Other', 'Prefer not to say']),
  body('phone').trim().isLength({ min: 7, max: 30 }),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail()
];

router.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT id, medical_record_number AS recordNumber,
      CONCAT(first_name, ' ', last_name) AS name, dob AS dateOfBirth, phone, email,
      created_at AS createdAt FROM patients ORDER BY created_at DESC`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/', requireAdmin, patientRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const recordNumber = `CF-${Date.now().toString(36).toUpperCase()}`;
    const [result] = await pool.execute(`INSERT INTO patients
      (medical_record_number, first_name, last_name, dob, sex, phone, email, address, medical_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [recordNumber, req.body.firstName, req.body.lastName,
      req.body.dateOfBirth, req.body.sex, req.body.phone, req.body.email || null,
      req.body.address || null, req.body.medicalHistory || null]);
    res.status(201).json({ id: result.insertId, recordNumber });
  } catch (error) { next(error); }
});

router.get('/:id', requirePatient, async (req, res, next) => {
  const patientId = Number(req.params.id);
  if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ error: 'Invalid patient ID' });
  if (req.patient.id !== patientId) return res.status(403).json({ error: 'You can only view your own patient profile' });
  try {
    const [patientRows] = await pool.execute(`SELECT id, medical_record_number AS recordNumber,
      first_name AS firstName, last_name AS lastName, email, phone, dob, sex, address,
      created_at AS createdAt FROM patients WHERE id = ? LIMIT 1`, [patientId]);
    const [appointments] = await pool.execute(`SELECT a.id, a.department, a.preferred_date AS preferredDate,
      a.appointment_at AS appointmentAt, a.reason, a.status, a.created_at AS createdAt,
      CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor
      FROM appointments a LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE a.patient_id = ? ORDER BY a.preferred_date DESC, a.id DESC`, [patientId]);
    const [statusHistory] = await pool.execute(`SELECT h.appointment_id AS appointmentId,
      h.status, h.changed_at AS changedAt, h.changed_by_role AS changedByRole
      FROM appointment_status_history h JOIN appointments a ON a.id = h.appointment_id
      WHERE a.patient_id = ? ORDER BY h.changed_at DESC`, [patientId]);
    const [consultations] = await pool.execute(`SELECT c.consultation_id AS id,
      c.appointment_id AS appointmentId, c.diagnosis, c.clinical_notes AS clinicalNotes,
      c.treatment_plan AS treatmentPlan, c.follow_up_date AS followUpDate,
      c.created_at AS createdAt, a.department, a.appointment_at AS appointmentAt,
      a.status, CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor
      FROM consultations c JOIN appointments a ON a.id = c.appointment_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE a.patient_id = ? ORDER BY c.created_at DESC`, [patientId]);
    const [prescriptions] = await pool.execute(`SELECT p.prescription_id AS id,
      p.quantity, p.instructions, p.status, p.created_at AS createdAt,
      p.ready_at AS readyAt,
      m.medication_name AS medication, m.dosage
      FROM prescriptions p JOIN consultations c ON c.consultation_id = p.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN pharmacy_inventory m ON m.medication_id = p.medication_id
      WHERE a.patient_id = ? ORDER BY p.created_at DESC`, [patientId]);
    res.json({ patient: patientRows[0], appointments, statusHistory, consultations, prescriptions });
  } catch (error) { next(error); }
});

module.exports = router;