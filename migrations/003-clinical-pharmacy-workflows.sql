USE careflow_db;

ALTER TABLE doctors
  ADD COLUMN consultation_fee DECIMAL(10,2) NOT NULL DEFAULT 500.00;

CREATE TABLE appointment_status_history (
  history_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  status ENUM('Pending','Scheduled','Checked in','Completed','Cancelled') NOT NULL,
  changed_by_role ENUM('admin','doctor','system') NOT NULL,
  changed_by_id INT UNSIGNED,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  INDEX idx_appointment_history (appointment_id, changed_at)
);

ALTER TABLE prescriptions
  MODIFY status ENUM('Pending','Ready for pickup','Dispensed','Cancelled') NOT NULL DEFAULT 'Pending',
  ADD COLUMN ready_at DATETIME NULL,
  ADD COLUMN dispensed_at DATETIME NULL;

ALTER TABLE invoices
  ADD COLUMN invoice_type ENUM('Consultation','Prescription','Sale','Other') NOT NULL DEFAULT 'Other';

CREATE TABLE invoice_items (
  invoice_item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) AS (quantity * unit_price) STORED,
  FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE
);
