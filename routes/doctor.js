const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireDoctor } = require('../middleware/patient-session');
const { createInvoice } = require('../services/invoices');

const router = express.Router();

router.get('/medications', requireDoctor, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT medication_id AS id, medication_name AS name,
      dosage, stock_quantity AS stock FROM pharmacy_inventory
      WHERE stock_quantity > 0 AND expiry_date > CURDATE()
      ORDER BY medication_name, dosage`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

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
    const [prescriptions] = await pool.execute(`SELECT p.prescription_id AS id, p.quantity,
      p.instructions, p.status, p.created_at AS createdAt, m.medication_name AS medication,
      m.dosage FROM prescriptions p JOIN pharmacy_inventory m ON m.medication_id = p.medication_id
      JOIN consultations c ON c.consultation_id = p.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      WHERE a.patient_id = ? AND a.doctor_id = ? ORDER BY p.created_at DESC`,
    [patientId, req.doctor.id]);
    res.json({ patient: patients[0], appointments, consultations, prescriptions });
  } catch (error) {
    next(error);
  }
});

router.post('/appointments/:id/check-in', requireDoctor, async (req, res, next) => {
  const appointmentId = Number(req.params.id);
  if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[appointment]] = await connection.execute(`SELECT id, status FROM appointments
      WHERE id = ? AND doctor_id = ? FOR UPDATE`, [appointmentId, req.doctor.id]);
    if (!appointment) {
      await connection.rollback();
      return res.status(404).json({ error: 'Appointment not found in your schedule' });
    }
    if (!['Pending', 'Scheduled'].includes(appointment.status)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Only pending or scheduled appointments can be checked in' });
    }
    await connection.execute("UPDATE appointments SET status = 'Checked in' WHERE id = ?", [appointmentId]);
    await connection.execute(`INSERT INTO appointment_status_history
      (appointment_id, status, changed_by_role, changed_by_id)
      VALUES (?, 'Checked in', 'doctor', ?)`, [appointmentId, req.doctor.id]);
    await connection.commit();
    return res.json({ status: 'Checked in' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/appointments/:id/consultations', requireDoctor, [
  body('diagnosis').isString().trim().isLength({ min: 1, max: 10000 }),
  body('clinicalNotes').optional({ values: 'falsy' }).isString().trim().isLength({ max: 10000 }),
  body('treatmentPlan').optional({ values: 'falsy' }).isString().trim().isLength({ max: 10000 }),
  body('followUpDate').optional({ values: 'falsy' }).isISO8601({ strict: true, strictSeparator: true }),
  body('additionalCharges').optional().isArray({ max: 20 }),
  body('additionalCharges.*.description').isString().trim().isLength({ min: 1, max: 255 }),
  body('additionalCharges.*.unitPrice').isFloat({ min: 0, max: 99999999.99 }).toFloat(),
  body('prescriptions').optional().isArray({ max: 20 }),
  body('prescriptions.*.medicationId').isInt({ min: 1 }).toInt(),
  body('prescriptions.*.quantity').isInt({ min: 1, max: 10000 }).toInt(),
  body('prescriptions.*.instructions').isString().trim().isLength({ min: 1, max: 255 })
], async (req, res, next) => {
  const appointmentId = Number(req.params.id);
  if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Check the consultation and prescription details', details: errors.array() });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[appointment]] = await connection.execute(`SELECT a.id, a.patient_id, a.status,
      d.consultation_fee FROM appointments a JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE a.id = ? AND a.doctor_id = ? FOR UPDATE`, [appointmentId, req.doctor.id]);
    if (!appointment) {
      await connection.rollback();
      return res.status(404).json({ error: 'Appointment not found in your schedule' });
    }
    if (appointment.status !== 'Checked in') {
      await connection.rollback();
      return res.status(409).json({ error: 'Check the patient in before recording a consultation' });
    }

    const [consultationResult] = await connection.execute(`INSERT INTO consultations
      (appointment_id, diagnosis, clinical_notes, treatment_plan, follow_up_date)
      VALUES (?, ?, ?, ?, ?)`, [appointmentId, req.body.diagnosis,
      req.body.clinicalNotes || null, req.body.treatmentPlan || null, req.body.followUpDate || null]);
    const consultationId = consultationResult.insertId;
    const invoiceItems = [{
      description: 'Doctor consultation',
      quantity: 1,
      unitPrice: Number(appointment.consultation_fee)
    }, ...(req.body.additionalCharges || []).map(charge => ({
      description: charge.description,
      quantity: 1,
      unitPrice: charge.unitPrice
    }))];
    const invoiceId = await createInvoice(connection, {
      patientId: appointment.patient_id,
      appointmentId,
      invoiceType: 'Consultation',
      items: invoiceItems
    });

    for (const prescription of req.body.prescriptions || []) {
      const [[medication]] = await connection.execute(`SELECT medication_id FROM pharmacy_inventory
        WHERE medication_id = ? AND expiry_date > CURDATE() LIMIT 1`, [prescription.medicationId]);
      if (!medication) {
        await connection.rollback();
        return res.status(400).json({ error: `Medication ${prescription.medicationId} is unavailable or expired` });
      }
      await connection.execute(`INSERT INTO prescriptions
        (consultation_id, medication_id, quantity, instructions)
        VALUES (?, ?, ?, ?)`, [consultationId, prescription.medicationId,
        prescription.quantity, prescription.instructions]);
    }

    await connection.execute("UPDATE appointments SET status = 'Completed' WHERE id = ?", [appointmentId]);
    await connection.execute(`INSERT INTO appointment_status_history
      (appointment_id, status, changed_by_role, changed_by_id)
      VALUES (?, 'Completed', 'doctor', ?)`, [appointmentId, req.doctor.id]);
    await connection.commit();
    return res.status(201).json({ consultationId, invoiceId });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;
