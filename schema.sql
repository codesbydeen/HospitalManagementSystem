CREATE DATABASE IF NOT EXISTS careflow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE careflow_db;

CREATE TABLE IF NOT EXISTS patients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medical_record_number VARCHAR(24) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(160) UNIQUE,
  password_hash VARCHAR(255),
  role ENUM('patient','admin') NOT NULL DEFAULT 'patient',
  phone VARCHAR(30) NOT NULL,
  dob DATE NOT NULL,
  sex ENUM('Female','Male','Other','Prefer not to say') NOT NULL DEFAULT 'Prefer not to say',
  address VARCHAR(255),
  medical_history TEXT,
  emergency_contact_name VARCHAR(160),
  emergency_contact_phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
  doctor_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  license_number VARCHAR(60) NOT NULL UNIQUE,
  phone VARCHAR(30),
  email VARCHAR(160),
  availability_schedule JSON,
  consultation_fee DECIMAL(10,2) NOT NULL DEFAULT 500.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctor_accounts (
  doctor_id INT UNSIGNED PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED,
  department VARCHAR(120) NOT NULL,
  preferred_date DATE NOT NULL,
  appointment_at DATETIME NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('Pending','Scheduled','Checked in','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  source ENUM('Online','Reception','Referral') NOT NULL DEFAULT 'Reception',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id),
  INDEX idx_appointments_date (appointment_at),
  INDEX idx_appointments_status (status)
);

CREATE TABLE IF NOT EXISTS appointment_status_history (
  history_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  status ENUM('Pending','Scheduled','Checked in','Completed','Cancelled') NOT NULL,
  changed_by_role ENUM('admin','doctor','system') NOT NULL,
  changed_by_id INT UNSIGNED,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  INDEX idx_appointment_history (appointment_id, changed_at)
);

CREATE TABLE IF NOT EXISTS patient_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_sessions_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS doctor_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  doctor_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  INDEX idx_doctor_sessions_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS consultations (
  consultation_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL UNIQUE,
  diagnosis TEXT NOT NULL,
  clinical_notes TEXT,
  treatment_plan TEXT,
  follow_up_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  medication_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medication_name VARCHAR(160) NOT NULL,
  dosage VARCHAR(80) NOT NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  reorder_level INT UNSIGNED NOT NULL DEFAULT 10,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inventory_expiry (expiry_date)
);

CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT UNSIGNED NOT NULL,
  medication_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  instructions VARCHAR(255) NOT NULL,
  status ENUM('Pending','Ready for pickup','Dispensed','Cancelled') NOT NULL DEFAULT 'Pending',
  ready_at DATETIME,
  dispensed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consultation_id) REFERENCES consultations(consultation_id),
  FOREIGN KEY (medication_id) REFERENCES pharmacy_inventory(medication_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED,
  prescription_id INT UNSIGNED,
  invoice_type ENUM('Consultation','Prescription','Sale','Other') NOT NULL DEFAULT 'Other',
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) AS (subtotal + tax) STORED,
  status ENUM('Unpaid','Paid','Void') NOT NULL DEFAULT 'Unpaid',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  invoice_item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) AS (quantity * unit_price) STORED,
  FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE
);