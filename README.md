# CareFlow Hospital Management System

CareFlow is a vanilla JavaScript SPA with an Express/MySQL API for patient registration, EHR-ready records, appointments, pharmacy inventory, prescriptions, and billing.

## Run locally

1. Install the backend dependencies with `npm install` (Express, CORS, dotenv, mysql2, bcryptjs, Helmet, express-rate-limit, and express-validator).
2. Copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME=careflow_db` for your MySQL connection. Set `PORT` if 3000 is unavailable.
3. In VS Code, install the SQLTools extension and its MySQL/MariaDB driver. Connect to your local MySQL server and execute `schema.sql` as an administrator. This creates the `careflow_db` database and tables. For an existing database, run `migrations/001-add-patient-roles.sql` once as an administrator before starting the updated app. Back up existing data before running schema changes.
4. Create a dedicated application account after running the schema (replace the example password with your own local development password):

   ```sql
   CREATE USER IF NOT EXISTS 'careflow_app'@'127.0.0.1' IDENTIFIED BY 'replace_with_a_local_password';
   GRANT SELECT, INSERT, UPDATE, DELETE ON careflow_db.* TO 'careflow_app'@'127.0.0.1';
   ```

   Put that account and password in `.env`; the app account does not need database-administration privileges.
5. Start the app with `npm start`, then open `http://localhost:3000`.

6. Create a patient account through `patient-register.html`, then promote that account to admin in SQL using the registered email:

   ```sql
   UPDATE careflow_db.patients SET role = 'admin' WHERE email = 'admin@example.com';
   ```

   Sign out and log in again after promotion. Admin accounts cannot be created through public registration. New registrations receive the `patient` role.

Patient passwords are bcrypt-hashed and login sessions use an opaque, hashed server-side token in an HttpOnly cookie. Patient-directory and staff endpoints require an admin session; patient users can only view their own profile. The public doctor listing returns only active clinicians' names and specialties; the admin doctor directory includes contact details and license numbers. The admin UI retains demo fallbacks for operational summaries when their read APIs are unavailable; patient and doctor directories instead show errors. This is still a development prototype: do not expose it to the public internet or use it with real patient data without a full security review, HTTPS, audit logging, backups, and secrets management.

## API surface

- `POST /api/register` with `firstName`, `lastName`, `email`, `password`, `phone`, `dob`, and optional `sex` creates a patient account and starts a session.
- `POST /api/login` with `email` and `password` starts a session and returns the account role; the login page redirects admins to `admin.html` and patients to their portal. `POST /api/logout` ends either session.
- `GET /api/session` returns the signed-in account summary and role.
- `GET /api/patients` and `POST /api/patients` require an admin session. The patient directory excludes credentials and medical-history fields.
- `GET /api/patients/:id` returns the signed-in patient's profile and appointments; patient accounts cannot read another patient's profile.
- `POST /api/appointments` with `department`, `preferredDate`, `reason`, and optional `preferredTime` creates a Pending appointment for the signed-in patient.
- `GET /api/doctors` returns public names and specialties for active doctors; `GET /api/doctors/directory` requires an admin session.
- `GET /api/appointments`, `PATCH /api/appointments/:id/status`, `GET /api/pharmacy/inventory`, and `GET /api/billing/invoices` require an admin session.
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