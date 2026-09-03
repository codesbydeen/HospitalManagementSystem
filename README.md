# CareFlow Hospital Management System

CareFlow is a vanilla JavaScript SPA with an Express/MySQL API for patient registration, EHR-ready records, appointments, pharmacy inventory, prescriptions, and billing.

## Run locally

1. Copy `.env.example` to `.env` and set the MySQL credentials.
2. Create the database with `mysql -u root -p < schema.sql`.
3. Install dependencies with `npm install`.
4. Start the app with `npm start`, then open `http://localhost:3000`.

The UI includes realistic demo data when MySQL is unavailable, so the flows can be reviewed before database setup. API writes and reads use parameterized queries. Production deployment should add authentication/authorization, encrypted transport, audit logging, backups, and a secrets manager before handling real patient data.

## API surface

- `GET|POST /api/patients`
- `GET /api/doctors`
- `GET /api/appointments`, `PATCH /api/appointments/:id/status`
- `GET /api/pharmacy/inventory`
- `GET /api/billing/invoices`
- `GET /api/health`

The UI tokens mirror the supplied Figma file: 260px navigation, 80px header, `#16162A` navigation, `#F8F7FC` workspace, `#E9D7FF` borders, and a purple action accent.

## Figma screen pages

The patient-facing screens use the light CareFlow header from the supplied Figma designs and can be opened directly:

- `public/registration-ehr-profile.html` - registration form, progress state, and EHR preview
- `public/appointment-booking.html` - specialty filters, clinician selection, and time slots
- `public/consultation-history.html` - consultation timeline, prescriptions, and patient summary
- `public/billing-notifications.html` - invoice status, payment alert, and notifications