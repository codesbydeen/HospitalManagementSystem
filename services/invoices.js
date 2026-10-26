async function createInvoice(connection, {
  patientId,
  appointmentId = null,
  prescriptionId = null,
  invoiceType,
  items
}) {
  const subtotal = items.reduce(
    (total, item) => total + item.quantity * Math.round(item.unitPrice * 100),
    0
  ) / 100;
  const [result] = await connection.execute(`INSERT INTO invoices
    (patient_id, appointment_id, prescription_id, invoice_type, subtotal, tax)
    VALUES (?, ?, ?, ?, ?, 0)`,
  [patientId, appointmentId, prescriptionId, invoiceType, subtotal]);

  for (const item of items) {
    await connection.execute(`INSERT INTO invoice_items
      (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)`,
    [result.insertId, item.description, item.quantity, item.unitPrice]);
  }
  return result.insertId;
}

module.exports = { createInvoice };
