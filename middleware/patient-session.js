const crypto = require('crypto');
const pool = require('../db');

const COOKIE_NAME = 'careflow_session';

function sessionToken(req) {
  const authorization = req.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) return authorization.slice(7);
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=1209600${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0`);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(patientId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  await pool.execute(`INSERT INTO patient_sessions (token_hash, patient_id, expires_at)
    VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))`, [tokenHash, patientId]);
  setSessionCookie(res, token);
}

async function createDoctorSession(doctorId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  await pool.execute(`INSERT INTO doctor_sessions (token_hash, doctor_id, expires_at)
    VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))`, [tokenHash, doctorId]);
  setSessionCookie(res, token);
}

function requireRole(allowedRoles) {
  return async (req, res, next) => {
    const token = sessionToken(req);
    if (!token) return res.status(401).json({ error: 'Please log in to continue' });
    try {
      const [patientRows] = await pool.execute(`SELECT p.id, p.first_name AS firstName, p.last_name AS lastName,
        p.email, p.phone, p.dob, p.role FROM patient_sessions s JOIN patients p ON p.id = s.patient_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [hashToken(token)]);
      if (patientRows.length) {
        const patient = patientRows[0];
        if (!['patient', 'admin'].includes(patient.role)) {
          clearSessionCookie(res);
          return res.status(403).json({ error: 'Your account role is missing or invalid. Contact an administrator.' });
        }
        if (!allowedRoles.includes(patient.role)) {
          return res.status(403).json({ error: 'You do not have permission to access this resource' });
        }
        req.patient = patient;
        req.auth = patient;
        return next();
      }

      const [doctorRows] = await pool.execute(`SELECT d.doctor_id AS id, d.first_name AS firstName,
        d.last_name AS lastName, a.email, 'doctor' AS role
        FROM doctor_sessions s
        JOIN doctors d ON d.doctor_id = s.doctor_id
        JOIN doctor_accounts a ON a.doctor_id = d.doctor_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND d.is_active = TRUE LIMIT 1`,
      [hashToken(token)]);
      if (!doctorRows.length) {
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
      }
      const doctor = doctorRows[0];
      if (!allowedRoles.includes(doctor.role)) {
        return res.status(403).json({ error: 'You do not have permission to access this resource' });
      }
      req.doctor = doctor;
      req.auth = doctor;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const requireAuthenticated = requireRole(['patient', 'admin', 'doctor']);
const requirePatient = requireRole(['patient']);
const requireAdmin = requireRole(['admin']);
const requireDoctor = requireRole(['doctor']);

module.exports = {
  clearSessionCookie,
  createDoctorSession,
  createSession,
  hashToken,
  requireAdmin,
  requireAuthenticated,
  requireDoctor,
  requirePatient,
  sessionToken
};