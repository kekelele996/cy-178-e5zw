const express = require('express');
const cors = require('cors');
const { PORTS, ROUTES, SWEEP_INTERVAL_MS } = require('./config/constants');
const authRoutes = require('./routes/authRoutes');
const letterRoutes = require('./routes/letterRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const LetterService = require('./services/letterService');
const { startDatabasePlaceholder } = require('./data/dbPort');

require('./data/database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(ROUTES.AUTH, authRoutes);
app.use(ROUTES.LETTERS, letterRoutes);
app.use(ROUTES.INBOX, inboxRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开了个小差' });
});

startDatabasePlaceholder();

// 限时转投：定时把超时未处理的信件收回待转投区；
// 具体业务操作前也会懒扫描一次，这里只是让到期状态在无人访问时也能推进
const sweepTimer = setInterval(() => {
  try {
    LetterService.sweepExpired();
  } catch (err) {
    console.error('[sweep] failed:', err.message);
  }
}, SWEEP_INTERVAL_MS);
if (sweepTimer.unref) sweepTimer.unref();

app.listen(PORTS.BACKEND, '0.0.0.0', () => {
  console.log(`[backend] listening on 0.0.0.0:${PORTS.BACKEND}`);
});
