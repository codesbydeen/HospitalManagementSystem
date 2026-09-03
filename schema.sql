CREATE DATABASE IF NOT EXISTS careflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE careflow;

CREATE TABLE IF NOT EXISTS Patients (
  patient_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medical_record_number VARCHAR(24) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  date_of_birth DATE NOT NULL,
  sex ENUM('Female','Male','Other','Prefer not to say') NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(160),
  address VARCHAR(255),
  medical_history TEXT,
  emergency_contact_name VARCHAR(160),
  emergency_contact_phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Doctors (
  doctor_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  license_number VARCHAR(60) NOT NULL UNIQUE,
  phone VARCHAR(30),
  email VARCHAR(160),
  availability_schedule JSON,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Appointments (
  appointment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED NOT NULL,
  appointment_at DATETIME NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('Scheduled','Checked in','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  source ENUM('Online','Reception','Referral') NOT NULL DEFAULT 'Reception',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
  FOREIGN KEY (doctor_id) REFERENCES Doctors(doctor_id),
  INDEX idx_appointments_date (appointment_at),
  INDEX idx_appointments_status (status)
);

CREATE TABLE IF NOT EXISTS Consultations (
  consultation_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL UNIQUE,
  diagnosis TEXT NOT NULL,
  clinical_notes TEXT,
  treatment_plan TEXT,
  follow_up_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES Appointments(appointment_id)
);

CREATE TABLE IF NOT EXISTS PharmacyInventory (
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

CREATE TABLE IF NOT EXISTS Prescriptions (
  prescription_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT UNSIGNED NOT NULL,
  medication_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  instructions VARCHAR(255) NOT NULL,
  status ENUM('Pending','Dispensed','Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consultation_id) REFERENCES Consultations(consultation_id),
  FOREIGN KEY (medication_id) REFERENCES PharmacyInventory(medication_id)
);

CREATE TABLE IF NOT EXISTS Invoices (
  invoice_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED,
  prescription_id INT UNSIGNED,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) AS (subtotal + tax) STORED,
  status ENUM('Unpaid','Paid','Void') NOT NULL DEFAULT 'Unpaid',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
  FOREIGN KEY (appointment_id) REFERENCES Appointments(appointment_id),
  FOREIGN KEY (prescription_id) REFERENCES Prescriptions(prescription_id)
);