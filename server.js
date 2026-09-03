const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/patients', require('./routes/patients'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/pharmacy', require('./routes/pharmacy'));
app.use('/api/billing', require('./routes/billing'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'careflow' }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: 'Unable to complete request' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`CareFlow running at http://localhost:${port}`));