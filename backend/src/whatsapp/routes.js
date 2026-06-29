const express = require('express');
const { sendMessage, getStatus, getQr, getPairingCode, getGroups, refreshPairingCode, resetSession } = require('./client');

const router = express.Router();

// Rate limit: max 20 mensajes por hora desde cualquier cliente
const sendLog = [];
const MAX_SENDS_PER_HOUR = 20;

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.WHATSAPP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function rateLimitSend(req, res, next) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  while (sendLog.length > 0 && sendLog[0] < oneHourAgo) sendLog.shift();
  if (sendLog.length >= MAX_SENDS_PER_HOUR) {
    console.warn('[whatsapp] Rate limit alcanzado — bloqueando envio');
    return res.status(429).json({ error: 'Rate limit: max 20 mensajes por hora' });
  }
  sendLog.push(now);
  next();
}

router.get('/status', requireApiKey, (_req, res) => {
  res.json(getStatus());
});

router.get('/qr', requireApiKey, (_req, res) => {
  const qr = getQr();
  if (!qr) return res.status(404).json({ error: 'Sin QR disponible' });
  res.json({ qr });
});

router.get('/pairing-code', requireApiKey, (_req, res) => {
  const code = getPairingCode();
  if (!code) return res.status(404).json({ error: 'Sin pairing code — ya conectado o configure WA_PHONE_NUMBER' });
  res.json({ code });
});

router.post('/pairing-code/refresh', requireApiKey, async (_req, res) => {
  try {
    const code = await refreshPairingCode();
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-session', requireApiKey, async (_req, res) => {
  try {
    await resetSession();
    res.json({ ok: true, message: 'Sesion borrada — reinicia el servidor para obtener nuevo pairing code' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups', requireApiKey, async (_req, res) => {
  try {
    const groups = await getGroups();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/send', requireApiKey, rateLimitSend, async (req, res) => {
  const { message, to } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta campo: message' });
  try {
    await sendMessage(message, to || null);
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp] Error al enviar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
