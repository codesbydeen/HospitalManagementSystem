const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { requireAdmin } = require('../middleware/patient-session');
const { createInvoice } = require('../services/invoices');
const router = express.Router();

router.post('/inventory', requireAdmin, [
  body('name').isString().trim().isLength({ min: 1, max: 160 }),
  body('dosage').isString().trim().isLength({ min: 1, max: 80 }),
  body('stock').isInt({ min: 0, max: 4294967295 }).toInt(),
  body('reorderLevel').isInt({ min: 0, max: 4294967295 }).toInt(),
  body('unitPrice').isFloat({ min: 0, max: 99999999.99 }).toFloat(),
  body('expiryDate').isString().isDate({ format: 'YYYY-MM-DD', strictMode: true })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Check the medication details and try again', details: errors.array() });
  }
  try {
    const [result] = await pool.execute(`INSERT INTO pharmacy_inventory
      (medication_name, dosage, stock_quantity, reorder_level, unit_price, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?)`, [req.body.name, req.body.dosage, req.body.stock,
      req.body.reorderLevel, req.body.unitPrice, req.body.expiryDate]);
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return next(error);
  }
});

router.get('/inventory', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT medication_id AS id, medication_name AS name, dosage,
      stock_quantity AS stock, reorder_level AS reorderLevel, unit_price AS unitPrice, expiry_date AS expiryDate,
      CASE WHEN expiry_date < CURDATE() THEN 'Expired'
        WHEN stock_quantity <= reorder_level THEN 'Low stock'
        WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Expiring soon'
        ELSE 'In stock' END AS alert
      FROM pharmacy_inventory ORDER BY expiry_date ASC, stock_quantity ASC`);
    res.json(rows);
  } catch (error) { next(error); }
});

router.get('/prescriptions', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT p.prescription_id AS id, p.quantity, p.instructions,
      p.status, p.created_at AS createdAt, p.dispensed_at AS dispensedAt,
      m.medication_name AS medication, m.dosage, m.stock_quantity AS stock,
      m.expiry_date AS expiryDate, a.id AS appointmentId,
      CONCAT(patient.first_name, ' ', patient.last_name) AS patient,
      CONCAT('Dr. ', doctor.first_name, ' ', doctor.last_name) AS doctor
      FROM prescriptions p JOIN pharmacy_inventory m ON m.medication_id = p.medication_id
      JOIN consultations c ON c.consultation_id = p.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN patients patient ON patient.id = a.patient_id
      LEFT JOIN doctors doctor ON doctor.doctor_id = a.doctor_id
      WHERE p.status IN ('Pending', 'Ready for pickup')
      ORDER BY p.created_at`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/dispensing', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT p.prescription_id AS id, p.quantity,
      p.instructions, p.dispensed_at AS dispensedAt, m.medication_name AS medication,
      m.dosage, CONCAT(patient.first_name, ' ', patient.last_name) AS patient,
      CONCAT('INV-', LPAD(i.invoice_id, 5, '0')) AS invoiceNumber, i.total AS invoiceTotal
      FROM prescriptions p JOIN pharmacy_inventory m ON m.medication_id = p.medication_id
      JOIN consultations c ON c.consultation_id = p.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN patients patient ON patient.id = a.patient_id
      LEFT JOIN invoices i ON i.prescription_id = p.prescription_id
      WHERE p.status = 'Dispensed' ORDER BY p.dispensed_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.patch('/prescriptions/:id/status', requireAdmin,
  body('status').isIn(['Ready for pickup', 'Cancelled']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Choose a valid prescription status' });
    const prescriptionId = Number(req.params.id);
    if (!Number.isSafeInteger(prescriptionId) || prescriptionId < 1) {
      return res.status(400).json({ error: 'Invalid prescription ID' });
    }
    try {
      const [result] = await pool.execute(`UPDATE prescriptions SET status = ?,
        ready_at = IF(? = 'Ready for pickup', UTC_TIMESTAMP(), NULL)
        WHERE prescription_id = ? AND status = 'Pending'`,
      [req.body.status, req.body.status, prescriptionId]);
      if (!result.affectedRows) return res.status(409).json({ error: 'Prescription is no longer pending' });
      res.json({ status: req.body.status });
    } catch (error) {
      next(error);
    }
  });

router.post('/prescriptions/:id/dispense', requireAdmin, async (req, res, next) => {
  const prescriptionId = Number(req.params.id);
  if (!Number.isSafeInteger(prescriptionId) || prescriptionId < 1) {
    return res.status(400).json({ error: 'Invalid prescription ID' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[prescription]] = await connection.execute(`SELECT p.status, p.quantity, p.medication_id,
      c.appointment_id, a.patient_id, m.medication_name, m.dosage, m.unit_price,
      m.stock_quantity, m.expiry_date <= CURDATE() AS expired
      FROM prescriptions p JOIN consultations c ON c.consultation_id = p.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN pharmacy_inventory m ON m.medication_id = p.medication_id
      WHERE p.prescription_id = ? FOR UPDATE`, [prescriptionId]);
    if (!prescription) {
      await connection.rollback();
      return res.status(404).json({ error: 'Prescription not found' });
    }
    if (!['Pending', 'Ready for pickup'].includes(prescription.status)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Prescription is not awaiting dispensing' });
    }
    if (prescription.expired) {
      await connection.rollback();
      return res.status(409).json({ error: 'This medication has expired and cannot be dispensed' });
    }
    if (Number(prescription.stock_quantity) < Number(prescription.quantity)) {
      await connection.rollback();
      return res.status(409).json({ error: 'There is not enough medication in stock to fulfill this prescription' });
    }
    await connection.execute(`UPDATE pharmacy_inventory
      SET stock_quantity = stock_quantity - ? WHERE medication_id = ?`,
    [prescription.quantity, prescription.medication_id]);
    const invoiceId = await createInvoice(connection, {
      patientId: prescription.patient_id,
      appointmentId: prescription.appointment_id,
      prescriptionId,
      invoiceType: 'Prescription',
      items: [{
        description: `${prescription.medication_name} ${prescription.dosage}`,
        quantity: Number(prescription.quantity),
        unitPrice: Number(prescription.unit_price)
      }]
    });
    await connection.execute(`UPDATE prescriptions SET status = 'Dispensed', dispensed_at = UTC_TIMESTAMP()
      WHERE prescription_id = ?`, [prescriptionId]);
    await connection.commit();
    return res.json({ status: 'Dispensed', invoiceId });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/sales', requireAdmin, [
  body('patientId').isInt({ min: 1 }).toInt(),
  body('items').isArray({ min: 1, max: 30 }),
  body('items.*.medicationId').isInt({ min: 1 }).toInt(),
  body('items.*.quantity').isInt({ min: 1, max: 10000 }).toInt()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Check the patient and sale items', details: errors.array() });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[patient]] = await connection.execute('SELECT id FROM patients WHERE id = ? LIMIT 1', [req.body.patientId]);
    if (!patient) {
      await connection.rollback();
      return res.status(400).json({ error: 'Choose an existing patient' });
    }
    const quantities = new Map();
    for (const item of req.body.items) {
      quantities.set(item.medicationId, (quantities.get(item.medicationId) || 0) + item.quantity);
    }
    const items = [];
    for (const [medicationId, quantity] of quantities) {
      const [[medication]] = await connection.execute(`SELECT medication_name, dosage,
        unit_price, stock_quantity, expiry_date <= CURDATE() AS expired FROM pharmacy_inventory
        WHERE medication_id = ? FOR UPDATE`, [medicationId]);
      if (!medication || medication.expired) {
        await connection.rollback();
        return res.status(400).json({ error: `Medication ${medicationId} is unavailable or expired` });
      }
      if (Number(medication.stock_quantity) < quantity) {
        await connection.rollback();
        return res.status(409).json({ error: `Insufficient stock for ${medication.medication_name}` });
      }
      await connection.execute(`UPDATE pharmacy_inventory SET stock_quantity = stock_quantity - ?
        WHERE medication_id = ?`, [quantity, medicationId]);
      items.push({
        description: `${medication.medication_name} ${medication.dosage}`,
        quantity,
        unitPrice: Number(medication.unit_price)
      });
    }
    const invoiceId = await createInvoice(connection, {
      patientId: patient.id,
      invoiceType: 'Sale',
      items
    });
    await connection.commit();
    return res.status(201).json({ invoiceId });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;