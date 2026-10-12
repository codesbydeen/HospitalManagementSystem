USE careflow_db;

ALTER TABLE patients
  ADD COLUMN role ENUM('patient','admin') NOT NULL DEFAULT 'patient'
  AFTER password_hash;
