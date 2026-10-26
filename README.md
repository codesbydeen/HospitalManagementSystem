# CareFlow Hospital Management System

CareFlow is a vanilla JavaScript SPA with an Express/MySQL API for patient registration, EHR-ready records, appointments, pharmacy inventory, prescriptions, and billing.

## Run locally

1. Install the backend dependencies with `npm install` (Express, CORS, dotenv, mysql2, bcryptjs, Helmet, express-rate-limit, and express-validator).
2. Copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME=careflow_db` for your MySQL connection. Set `PORT` if 3000 is unavailable.
3. Follow [DATABASE-SETUP.md](./DATABASE-SETUP.md) to start MySQL, configure SQLTools, and load the schema. For a new database, execute `schema.sql` as an administrator; it already creates all current tables, including doctor accounts and sessions. Do not run migrations on top of a fresh schema. For an existing database, back it up and inspect its current tables before applying only the migrations it still needs.
4. Create a dedicated application account after running the schema (replace the example password with your own local development password):

   ```sql
   CREATE USER IF NOT EXISTS 'careflow_app'@'127.0.0.1' IDENTIFIED BY 'replace_with_a_local_password';
   GRANT SELECT, INSERT, UPDATE, DELETE ON careflow_db.* TO 'careflow_app'@'127.0.0.1';
   ```

   Put that account and password in `.env`; the app account does not need database-administration privileges.
5. Start the app with `npm start`, then open `http://localhost:3000`.

6. Bootstrap the first administrator by creating a patient account through `patient-register.html` and promoting it in SQL using its registered email:

   ```sql
   UPDATE careflow_db.patients SET role = 'admin' WHERE email = 'admin@example.com';
   ```

   Sign out and log in again after promotion. Admin accounts cannot be created through public registration. New registrations receive the `patient` role. This SQL step is only for initial administrator setup; the portal does not promote patient accounts.

Patient and doctor passwords are bcrypt-hashed and login sessions use opaque, hashed server-side tokens in HttpOnly cookies. Patient-directory and staff endpoints require an admin session; patients can only view their own profile, while doctor accounts can view only patients with an active, non-cancelled appointment assigned to that doctor. Admins create doctor accounts from the Patients & staff directory; each doctor login opens the restricted Doctor portal. The public doctor listing returns only active clinicians' names and specialties; the admin doctor directory includes contact details and license numbers. Admin dashboard, directory, appointment, clinical, pharmacy, billing, and report screens read their operational data from MySQL and display explicit empty/error states rather than demo records. Patient consultation history and invoices are scoped to the authenticated patient. Notifications are derived from recorded appointments, prescriptions, and invoices because this schema has no notification table; metrics such as beds or satisfaction are not displayed because the schema has no corresponding data. This is still a development prototype: do not expose it to the public internet or use it with real patient data without a full security review, HTTPS, audit logging, backups, and secrets management.

## API surface

- `POST /api/register` with `firstName`, `lastName`, `email`, `password`, `phone`, `dob`, and optional `sex` creates a patient account and starts a session.
- `POST /api/login` with `email` and `password` starts a session and returns the account role; admins go to `admin.html`, doctors to `doctor.html`, and patients to their portal. `POST /api/logout` ends either session.
- `GET /api/session` returns the signed-in account summary and role.
- `GET /api/patients` and `POST /api/patients` require an admin session. The patient directory excludes credentials and medical-history fields.
- `GET /api/doctor/patients` and `GET /api/doctor/patients/:id` require a doctor session and return only patients with an active, non-cancelled appointment assigned to that doctor.
- `GET /api/patients/:id` returns the signed-in patient's profile, appointments, consultations, and prescriptions; patient accounts cannot read another patient's profile.
- `POST /api/appointments` with `doctorId`, `department`, `preferredDate`, `preferredTime`, and `reason` creates a Pending appointment for the signed-in patient. `POST /api/appointments/admin` creates a Scheduled appointment for an existing patient and active doctor and requires an admin session. Both validate the date/time and reject doctor booking conflicts. `GET /api/appointments/availability?date=YYYY-MM-DD&specialty=...` returns active clinicians and their available times.
- `GET /api/doctors` returns public names and specialties for active doctors; `GET /api/doctors/directory` requires an admin session; `POST /api/doctors` creates a doctor and doctor login, and `POST /api/doctors/:id/account` creates a login for an existing doctor. Both account-management endpoints require an admin session.
- `GET /api/appointments`, `PATCH /api/appointments/:id/status`, `GET /api/pharmacy/inventory`, `POST /api/pharmacy/inventory`, and `GET /api/billing/invoices` require an admin session. The inventory endpoint accepts `name`, `dosage`, `stock`, `reorderLevel`, `unitPrice`, and `expiryDate`.
- `GET /api/billing/mine` returns only the signed-in patient's invoices.
- `GET /api/admin/dashboard`, `/api/admin/clinical`, and `/api/admin/reports` provide admin-only live dashboard and report data.
- `GET /api/health`

The patient forms live at `public/patient-register.html` and `public/patient-login.html`; the appointment page submits to the API and the patient portal reads its authenticated profile, consultation history, prescriptions, and invoices. The admin Patients & Staff page supports adding patients and doctors, and setting up logins for existing doctors; newly created active doctors immediately appear in the patient appointment-booking flow. Doctor accounts use `public/doctor.html` and can view only patients assigned to them. The Pharmacy & Inventory page supports adding medication records with stock, reorder threshold, unit price, and expiry details.

The UI tokens mirror the supplied Figma file: 260px navigation, 80px header, `#16162A` navigation, `#F8F7FC` workspace, `#E9D7FF` borders, and a purple action accent.

## Figma screen pages

The patient-facing screens use the light CareFlow header from the supplied Figma designs and can be opened directly:

- `public/registration-ehr-profile.html` - patient-facing hospital homepage
- `public/patient-register.html` and `public/patient-login.html` - patient portal account flows
- `public/appointment-booking.html` - specialty filters, clinician selection, and time slots
- `public/consultation-history.html` - consultation timeline, prescriptions, and patient summary
- `public/billing-notifications.html` - invoice status, payment alert, and notifications