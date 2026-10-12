const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');

const router = express.Router();

router.get('/dashboard', requireAdmin, async (_req, res, next) => {
  try {
    const [[patientCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM patients',
    );
    const [[appointmentsToday]] = await pool.query(
      'SELECT COUNT(*) AS total FROM appointments WHERE DATE(appointment_at) = CURDATE()',
    );
    const [[inventory]] = await pool.query(`SELECT COUNT(*) AS medicationCount,
      COALESCE(SUM(stock_quantity * unit_price), 0) AS inventoryValue,
      COALESCE(SUM(stock_quantity), 0) AS stockUnits,
      COALESCE(SUM(stock_quantity <= reorder_level OR expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0) AS attentionCount
      FROM pharmacy_inventory`);
    const [visits] = await pool.query(`SELECT DATE_FORMAT(DATE(appointment_at), '%Y-%m-%d') AS day, COUNT(*) AS total
      FROM appointments
      WHERE appointment_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND appointment_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      GROUP BY DATE_FORMAT(DATE(appointment_at), '%Y-%m-%d') ORDER BY day`);
    const [activity] = await pool.query(`(
      SELECT 'Patient registered' AS type, CONCAT(first_name, ' ', last_name) AS description, created_at AS occurredAt
      FROM patients ORDER BY created_at DESC LIMIT 5
    ) UNION ALL (
      SELECT CONCAT('Appointment ', LOWER(status)) AS type,
        CONCAT(p.first_name, ' ', p.last_name, ' · ', a.department) AS description,
        a.created_at AS occurredAt
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      ORDER BY a.created_at DESC LIMIT 5
    ) ORDER BY occurredAt DESC LIMIT 8`);
    const [todayAppointments] = await pool.query(`SELECT a.id,
      a.appointment_at AS appointmentAt, a.reason, a.status,
      CONCAT(p.first_name, ' ', p.last_name) AS patient,
      COALESCE(CONCAT('Dr. ', d.first_name, ' ', d.last_name), 'Care team') AS doctor
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE DATE(a.appointment_at) = CURDATE()
      ORDER BY a.appointment_at LIMIT 5`);
    res.json({
      patientCount: patientCount.total,
      appointmentsToday: appointmentsToday.total,
      inventory: {
        medicationCount: inventory.medicationCount,
        inventoryValue: inventory.inventoryValue,
        stockUnits: inventory.stockUnits,
        attentionCount: inventory.attentionCount
      },
      visits,
      activity,
      todayAppointments
    });
  } catch (error) {
    next(error);
  }
});

router.get('/clinical', requireAdmin, async (_req, res, next) => {
  try {
    const [appointments] = await pool.query(`SELECT a.id, a.appointment_at AS appointmentAt,
      a.reason, a.status, a.department, p.medical_record_number AS recordNumber,
      CONCAT(p.first_name, ' ', p.last_name) AS patient,
      COALESCE(CONCAT('Dr. ', d.first_name, ' ', d.last_name), 'Unassigned') AS doctor
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      WHERE DATE(a.appointment_at) = CURDATE()
        AND a.status IN ('Pending', 'Scheduled', 'Checked in')
      ORDER BY a.appointment_at`);
    const [doctors] = await pool.query(`SELECT specialty, COUNT(*) AS total
      FROM doctors WHERE is_active = TRUE GROUP BY specialty ORDER BY specialty`);
    const [consultations] = await pool.query(`SELECT c.consultation_id AS id,
      c.diagnosis, c.treatment_plan AS treatmentPlan, c.created_at AS createdAt,
      p.medical_record_number AS recordNumber,
      CONCAT(p.first_name, ' ', p.last_name) AS patient,
      COALESCE(CONCAT('Dr. ', d.first_name, ' ', d.last_name), 'Unassigned') AS doctor,
      a.status
      FROM consultations c JOIN appointments a ON a.id = c.appointment_id
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.doctor_id = a.doctor_id
      ORDER BY c.created_at DESC LIMIT 50`);
    res.json({ appointments, doctors, consultations });
  } catch (error) {
    next(error);
  }
});

router.get('/reports', requireAdmin, async (_req, res, next) => {
  try {
    const [[summary]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM patients) AS patientCount,
      (SELECT COUNT(*) FROM appointments WHERE status = 'Completed') AS completedVisits,
      (SELECT COALESCE(SUM(total), 0) FROM invoices
        WHERE status = 'Paid' AND issued_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS monthlyRevenue,
      (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE) AS activeDoctors`);
    const [visits] = await pool.query(`SELECT DATE_FORMAT(DATE(appointment_at), '%Y-%m-%d') AS day, COUNT(*) AS total
      FROM appointments
      WHERE appointment_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND appointment_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      GROUP BY DATE_FORMAT(DATE(appointment_at), '%Y-%m-%d') ORDER BY day`);
    const [departments] = await pool.query(`SELECT department, COUNT(*) AS appointments,
      SUM(status = 'Completed') AS completed
      FROM appointments GROUP BY department ORDER BY appointments DESC`);
    res.json({ ...summary, visits, departments });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
