const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin, requirePatient } = require('../middleware/patient-session');
const router = express.Router();

const isCalendarDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
};

function scheduleFor(doctor) {
  const schedule = typeof doctor.availability_schedule === 'string'
    ? JSON.parse(doctor.availability_schedule)
    : doctor.availability_schedule;
  return schedule || { days: [0, 1, 2, 3, 4, 5, 6], startTime: '08:30', endTime: '17:00', slotMinutes: 30 };
}

function hasAvailableSlot(doctor, date, time) {
  const schedule = scheduleFor(doctor);
  if (!Array.isArray(schedule.days) || !schedule.days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.endTime)
    || !Number.isInteger(schedule.slotMinutes) || schedule.slotMinutes < 15 || schedule.slotMinutes > 120) {
    return false;
  }
  const toMinutes = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  const requested = toMinutes(time);
  return end > start && requested >= start && requested < end
    && (requested - start) % schedule.slotMinutes === 0;
}

async function createAppointment({
  patientId,
  doctorId,
  department,
  preferredDate,
  preferredTime,
  reason,
  status,
  source,
  changedByRole,
  changedById = null
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[dateCheck]] = await connection.execute('SELECT ? > CURDATE() AS isFutureDate', [preferredDate]);
    if (!dateCheck.isFutureDate) throw Object.assign(new Error('Choose a future appointment date'), { status: 400 });

    if (doctorId) {
      const [[doctor]] = await connection.execute(`SELECT doctor_id, specialty, availability_schedule
        FROM doctors WHERE doctor_id = ? AND is_active = TRUE FOR UPDATE`, [doctorId]);
      if (!doctor || (department && doctor.specialty !== department)) {
        throw Object.assign(new Error('Choose an active clinician for this specialty'), { status: 400 });
      }
      if (!hasAvailableSlot(doctor, preferredDate, preferredTime)) {
        throw Object.assign(new Error('Choose a time within this doctor’s availability schedule'), { status: 400 });
      }
      const [[booked]] = await connection.execute(`SELECT id FROM appointments
        WHERE doctor_id = ? AND appointment_at = ? AND status != 'Cancelled' LIMIT 1`,
      [doctorId, `${preferredDate} ${preferredTime}:00`]);
      if (booked) {
        throw Object.assign(new Error('That appointment time was just taken. Choose another time.'), { status: 409 });
      }
      department = doctor.specialty;
    } else if (!hasAvailableSlot({ availability_schedule: null }, preferredDate, preferredTime)) {
      throw Object.assign(new Error('Choose a time within the clinic’s default schedule'), { status: 400 });
    }

    const [result] = await connection.execute(`INSERT INTO appointments
      (patient_id, doctor_id, department, preferred_date, appointment_at, reason, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, doctorId, department, preferredDate, `${preferredDate} ${preferredTime}:00`, reason, status, source]);
    await connection.execute(`INSERT INTO appointment_status_history
      (appointment_id, status, changed_by_role, changed_by_id) VALUES (?, ?, ?, ?)`,
    [result.insertId, status, changedByRole, changedById]);
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

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
      CONCAT('Dr. ', first_name, ' ', last_name) AS name, specialty, availability_schedule
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
    res.json(doctors.map(doctor => {
      const schedule = scheduleFor(doctor);
      const times = [];
      if (Array.isArray(schedule.days)
        && schedule.days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
        && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)
        && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.endTime)
        && Number.isInteger(schedule.slotMinutes) && schedule.slotMinutes >= 15 && schedule.slotMinutes <= 120) {
        const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
        const start = startHour * 60 + startMinute;
        const end = endHour * 60 + endMinute;
        for (let minutes = start; minutes < end; minutes += schedule.slotMinutes) {
          times.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
        }
      }
      return {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        availableTimes: times.filter(time => !bookedByDoctor.get(doctor.id)?.has(time))
      };
    }));
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
    if (!isCalendarDate(req.body.preferredDate)) {
      return res.status(400).json({ error: 'Choose a valid future appointment date' });
    }
    const id = await createAppointment({
      patientId: req.patient.id,
      doctorId: req.body.doctorId ? Number(req.body.doctorId) : null,
      department: req.body.department,
      preferredDate: req.body.preferredDate,
      preferredTime,
      reason: req.body.reason,
      status: 'Pending',
      source: 'Online',
      changedByRole: 'system'
    });
    return res.status(201).json({ success: true, appointment: { id, department: req.body.department, preferredDate: req.body.preferredDate, preferredTime, status: 'Pending' } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
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
    if (!isCalendarDate(req.body.preferredDate)) {
      return res.status(400).json({ error: 'Choose a valid future appointment date' });
    }
    const [[patient]] = await pool.execute('SELECT id FROM patients WHERE id = ? LIMIT 1', [req.body.patientId]);
    if (!patient) return res.status(400).json({ error: 'Choose an existing patient' });
    const id = await createAppointment({
      patientId: patient.id,
      doctorId: Number(req.body.doctorId),
      preferredDate: req.body.preferredDate,
      preferredTime: req.body.preferredTime,
      reason: req.body.reason,
      status: 'Scheduled',
      source: 'Reception',
      changedByRole: 'admin',
      changedById: req.auth.id
    });
    return res.status(201).json({ id, status: 'Scheduled' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

router.patch('/:id/status', requireAdmin, body('status').isIn(['Pending', 'Scheduled', 'Checked in', 'Cancelled']), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const appointmentId = Number(req.params.id);
  if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) return res.status(400).json({ error: 'Invalid appointment ID' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[appointment]] = await connection.execute('SELECT status FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
    if (!appointment) {
      await connection.rollback();
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appointment.status !== req.body.status) {
      await connection.execute('UPDATE appointments SET status = ? WHERE id = ?', [req.body.status, appointmentId]);
      await connection.execute(`INSERT INTO appointment_status_history
        (appointment_id, status, changed_by_role, changed_by_id)
        VALUES (?, ?, 'admin', ?)`, [appointmentId, req.body.status, req.auth.id]);
    }
    await connection.commit();
    res.json({ status: req.body.status });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

router.get('/:id/history', requireAdmin, async (req, res, next) => {
  const appointmentId = Number(req.params.id);
  if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }
  try {
    const [rows] = await pool.execute(`SELECT status, changed_by_role AS changedByRole,
      changed_at AS changedAt FROM appointment_status_history
      WHERE appointment_id = ? ORDER BY changed_at`, [appointmentId]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;