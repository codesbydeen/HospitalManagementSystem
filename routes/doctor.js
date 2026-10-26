const express = require('express');
const pool = require('../db');
const { requireDoctor } = require('../middleware/patient-session');

const router = express.Router();

router.get('/patients', requireDoctor, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT p.id, p.medical_record_number AS recordNumber,
      CONCAT(p.first_name, ' ', p.last_name) AS name, p.dob AS dateOfBirth,
      p.phone, p.email, MAX(a.appointment_at) AS lastAppointment
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      WHERE a.doctor_id = ? AND a.status != 'Cancelled'
      GROUP BY p.id, p.medical_record_number, p.first_name, p.last_name, p.dob, p.phone, p.email
      ORDER BY lastAppointment DESC`, [req.doctor.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/patients/:id', requireDoctor, async (req, res, next) => {
  const patientId = Number(req.params.id);
  if (!Number.isSafeInteger(patientId) || patientId < 1) {
    return res.status(400).json({ error: 'Invalid patient ID' });
  }

  try {
    const [patients] = await pool.execute(`SELECT p.id, p.medical_record_number AS recordNumber,
      p.first_name AS firstName, p.last_name AS lastName, p.email, p.phone, p.dob AS dateOfBirth,
      p.sex, p.address, p.medical_history AS medicalHistory
      FROM patients p
      WHERE p.id = ? AND EXISTS (
        SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = ?
          AND a.status != 'Cancelled'
      ) LIMIT 1`, [patientId, req.doctor.id]);
    if (!patients.length) return res.status(404).json({ error: 'Patient not found in your care' });

    const [appointments] = await pool.execute(`SELECT id, department, appointment_at AS appointmentAt,
      reason, status, source FROM appointments
      WHERE patient_id = ? AND doctor_id = ? AND status != 'Cancelled'
      ORDER BY appointment_at DESC`, [patientId, req.doctor.id]);
    const [consultations] = await pool.execute(`SELECT c.consultation_id AS id, c.diagnosis,
      c.clinical_notes AS clinicalNotes, c.treatment_plan AS treatmentPlan,
      c.follow_up_date AS followUpDate, c.created_at AS createdAt, a.appointment_at AS appointmentAt
      FROM consultations c JOIN appointments a ON a.id = c.appointment_id
      WHERE a.patient_id = ? AND a.doctor_id = ? ORDER BY c.created_at DESC`,
    [patientId, req.doctor.id]);
    res.json({ patient: patients[0], appointments, consultations });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
