require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDb } = require('./src/db');
const authRoutes = require('./src/routes/auth.routes');
const matchesRoutes = require('./src/routes/matches.routes');
const predictionsRoutes = require('./src/routes/predictions.routes');
const adminRoutes = require('./src/routes/admin.routes');
const scoreboardRoutes = require('./src/routes/scoreboard.routes');
const standingsRoutes = require('./src/routes/standings.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes.router);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/scoreboard', scoreboardRoutes);
app.use('/api/standings', standingsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Pronostico API escuchando en puerto ${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
