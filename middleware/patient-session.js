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

async function requirePatient(req, res, next) {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'Please log in to continue' });
  try {
    const [rows] = await pool.execute(`SELECT p.id, p.first_name AS firstName, p.last_name AS lastName,
      p.email, p.phone, p.dob FROM patient_sessions s JOIN patients p ON p.id = s.patient_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [hashToken(token)]);
    if (!rows.length) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    req.patient = rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { clearSessionCookie, createSession, hashToken, requirePatient, sessionToken };