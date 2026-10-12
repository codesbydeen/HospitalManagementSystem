# CareFlow Hospital Management System

CareFlow is a vanilla JavaScript SPA with an Express/MySQL API for patient registration, EHR-ready records, appointments, pharmacy inventory, prescriptions, and billing.

## Run locally

1. Install the backend dependencies with `npm install` (Express, CORS, dotenv, mysql2, bcryptjs, Helmet, express-rate-limit, and express-validator).
2. Copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME=careflow_db` for your MySQL connection. Set `PORT` if 3000 is unavailable.
3. In VS Code, install the SQLTools extension and its MySQL/MariaDB driver. Connect to your local MySQL server and execute `schema.sql` as an administrator. This creates the `careflow_db` database and tables. Back up existing data before running schema changes against a database you already use.
4. Create a dedicated application account after running the schema (replace the example password with your own local development password):

   ```sql
   CREATE USER IF NOT EXISTS 'careflow_app'@'127.0.0.1' IDENTIFIED BY 'replace_with_a_local_password';
   GRANT SELECT, INSERT, UPDATE, DELETE ON careflow_db.* TO 'careflow_app'@'127.0.0.1';
   ```

   Put that account and password in `.env`; the app account does not need database-administration privileges.
5. Start the app with `npm start`, then open `http://localhost:3000`.

The admin UI has demo fallbacks for read requests when MySQL is unavailable; patient registration, login, portal, and appointment requests require the database. API writes use parameterized queries. Patient passwords are bcrypt-hashed and login sessions use an opaque, hashed server-side token in an HttpOnly cookie. The existing staff/admin APIs do not yet have staff authentication or role-based authorization, so do not expose this app to the public internet or use it with real patient data until those controls, HTTPS, audit logging, backups, and secrets management are in place.

## API surface

- `POST /api/register` with `firstName`, `lastName`, `email`, `password`, `phone`, `dob`, and optional `sex` creates a patient account and starts a session.
- `POST /api/login` with `email` and `password` starts a session; `POST /api/logout` ends it.
- `GET /api/session` returns the current signed-in patient summary.
- `GET /api/patients` and `POST /api/patients` are the staff-facing patient directory and EHR registration endpoints.
- `GET /api/patients/:id` returns the signed-in patient's profile and appointments; patients cannot read another patient's profile.
- `POST /api/appointments` with `department`, `preferredDate`, `reason`, and optional `preferredTime` creates a Pending appointment for the signed-in patient.
- `GET /api/doctors`
- `GET /api/appointments`, `PATCH /api/appointments/:id/status`
- `GET /api/pharmacy/inventory`
- `GET /api/billing/invoices`
- `GET /api/health`

The patient forms live at `public/patient-register.html` and `public/patient-login.html`; the appointment page submits to the API and the patient portal reads its authenticated profile and appointment history.

The UI tokens mirror the supplied Figma file: 260px navigation, 80px header, `#16162A` navigation, `#F8F7FC` workspace, `#E9D7FF` borders, and a purple action accent.

## Figma screen pages

The patient-facing screens use the light CareFlow header from the supplied Figma designs and can be opened directly:

- `public/registration-ehr-profile.html` - patient-facing hospital homepage
- `public/patient-register.html` and `public/patient-login.html` - patient portal account flows
- `public/appointment-booking.html` - specialty filters, clinician selection, and time slots
- `public/consultation-history.html` - consultation timeline, prescriptions, and patient summary
- `public/billing-notifications.html` - invoice status, payment alert, and notifications