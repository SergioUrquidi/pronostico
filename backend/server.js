require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDb, client } = require('./src/db');
const { startAutoSync } = require('./src/sync-results');
const authRoutes = require('./src/routes/auth.routes');
const matchesRoutes = require('./src/routes/matches.routes');
const predictionsRoutes = require('./src/routes/predictions.routes');
const adminRoutes = require('./src/routes/admin.routes');
const scoreboardRoutes = require('./src/routes/scoreboard.routes');
const standingsRoutes = require('./src/routes/standings.routes');
const whatsappRoutes = require('./src/whatsapp/routes');
const notificationsRoutes = require('./src/routes/notifications.routes');
const { initWhatsApp } = require('./src/whatsapp/client');

const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes.router);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/scoreboard', scoreboardRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/notifications', notificationsRoutes);

app.use((err, req, res, _next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Pronostico API escuchando en puerto ${PORT}`);
      startAutoSync(client, 5 * 60 * 1000); // sync cada 5 min
      if (process.env.WHATSAPP_API_KEY && process.env.WA_GROUP_ID) {
        initWhatsApp();
      } else {
        console.log('[whatsapp] WHATSAPP_API_KEY o WA_GROUP_ID no configurados — modulo desactivado');
      }
    });
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
