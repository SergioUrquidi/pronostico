const { client: dbClient } = require('../db');
const { calcScore, calcAdvanceScore } = require('../scoring');

let sock = null;
let qrData = null;
let pairingCode = null;
let isReady = false;
let baileys = null;
let lastError = null;
let initCalled = false;
let credsRegistered = null;

async function getBaileys() {
  if (!baileys) baileys = await import('@whiskeysockets/baileys');
  return baileys;
}

function serialize(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
      return { __buf: Buffer.from(v).toString('base64') };
    }
    return v;
  });
}

function deserialize(str) {
  return JSON.parse(str, (_key, v) => {
    if (v?.__buf !== undefined) return Buffer.from(v.__buf, 'base64');
    return v;
  });
}

async function readData(key) {
  try {
    const { rows } = await dbClient.execute({
      sql: 'SELECT value FROM config WHERE key = ?',
      args: [key],
    });
    if (!rows[0]) return null;
    return deserialize(rows[0].value);
  } catch {
    return null;
  }
}

async function writeData(key, data) {
  const value = serialize(data);
  await dbClient.execute({
    sql: 'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, value],
  });
}

async function removeData(key) {
  await dbClient.execute({ sql: 'DELETE FROM config WHERE key = ?', args: [key] }).catch(() => {});
}

async function useTursoAuthState() {
  const { initAuthCreds } = await getBaileys();
  const savedCreds = await readData('wa_creds');
  const creds = savedCreds ?? initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(
          ids.map(async (id) => {
            data[id] = await readData(`wa_key_${type}_${id}`);
          })
        );
        return data;
      },
      set: async (data) => {
        await Promise.all(
          Object.entries(data).flatMap(([category, items]) =>
            Object.entries(items ?? {}).map(([id, value]) => {
              const k = `wa_key_${category}_${id}`;
              return value != null ? writeData(k, value) : removeData(k);
            })
          )
        );
      },
    },
  };

  return {
    state,
    saveCreds: () => writeData('wa_creds', state.creds),
  };
}

const silentLogger = {
  level: 'silent',
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  isLevelEnabled: () => false,
  child: () => silentLogger,
};

// ─── Incoming message handler ─────────────────────────────────────────────────

const KNOCKOUT_PHASES = new Set(['Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final']);

async function getScoreMessage(user) {
  const [{ rows: allUsers }, { rows: matches }, { rows: allPreds }] = await Promise.all([
    dbClient.execute("SELECT id FROM users WHERE role = 'player'"),
    dbClient.execute('SELECT id, phase, home_score, away_score, advance_winner FROM matches WHERE home_score IS NOT NULL'),
    dbClient.execute('SELECT user_id, match_id, home_pred, away_pred, advance_pred FROM predictions'),
  ]);

  const predMap = {};
  for (const p of allPreds) predMap[`${p.user_id}_${p.match_id}`] = p;

  const calcTotal = (uid) => {
    let pts = 0;
    for (const m of matches) {
      const pred = predMap[`${uid}_${m.id}`];
      if (!pred) continue;
      pts += calcScore(pred.home_pred, pred.away_pred, m.home_score, m.away_score);
      if (KNOCKOUT_PHASES.has(m.phase) && pred.advance_pred) {
        pts += calcAdvanceScore(pred.advance_pred, m.home_score, m.away_score, m.advance_winner);
      }
    }
    return pts;
  };

  const scores = allUsers.map((u) => ({ id: u.id, pts: calcTotal(u.id) }));
  scores.sort((a, b) => b.pts - a.pts);
  const myScore = scores.find((s) => s.id === user.id);
  const rank = scores.indexOf(myScore) + 1;

  return `*${user.display_name}*\nPuntos: ${myScore.pts}\nPosicion: ${rank} de ${allUsers.length}`;
}

async function getMatchesMessage() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);

  const { rows } = await dbClient.execute({
    sql: `SELECT home, away, time_local, home_score, away_score FROM matches
          WHERE kickoff_at_utc >= ? AND kickoff_at_utc <= ?
            AND home IS NOT NULL AND away IS NOT NULL
          ORDER BY kickoff_at_utc`,
    args: [start.toISOString(), end.toISOString()],
  });

  if (rows.length === 0) return 'No hay partidos hoy.';

  const lines = rows.map((m) => {
    const result = m.home_score !== null ? `${m.home_score}-${m.away_score}` : m.time_local;
    return `• ${m.home} vs ${m.away}  ${result}`;
  });

  return `*Partidos de hoy*\n${lines.join('\n')}`;
}

async function handleIncomingMessage(msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;
  if (msg.key.fromMe) return;

  const phone = jid.replace('@s.whatsapp.net', '');
  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  ).trim().toLowerCase();
  if (!text) return;

  const { rows } = await dbClient.execute({
    sql: "SELECT id, display_name FROM users WHERE wa_number = ? AND role = 'player'",
    args: [phone],
  });
  if (!rows[0]) return;

  const user = rows[0];
  let reply;

  try {
    if (text === 'puntaje' || text === 'puntos') {
      reply = await getScoreMessage(user);
    } else if (text === 'partidos' || text === 'hoy') {
      reply = await getMatchesMessage();
    } else if (text === 'ayuda' || text === 'help') {
      reply = `Hola ${user.display_name}! Comandos:\n• *puntaje* — tu puntuacion y posicion\n• *partidos* — partidos de hoy\n• *ayuda* — esta lista`;
    } else {
      reply = `No entiendo ese comando. Escribi *ayuda* para ver que puedo hacer.`;
    }
    await sock.sendMessage(jid, { text: reply });
  } catch (err) {
    console.error('[whatsapp] Error respondiendo a', phone, ':', err.message);
  }
}

async function initWhatsApp() {
  initCalled = true;
  const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = await getBaileys();

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useTursoAuthState();
  credsRegistered = state.creds.registered;
  console.log('[whatsapp] initWhatsApp — version:', version, '— creds.registered:', state.creds.registered);

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Pronostico', 'Chrome', '1.0'],
    logger: silentLogger,
    generateHighQualityLinkPreview: false,
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrData = qr;
      isReady = false;
      console.log('[whatsapp] QR disponible — ver en GET /api/whatsapp/qr');
      console.log('[whatsapp] QR data:', qr);
    }

    if (connection === 'open') {
      qrData = null;
      pairingCode = null;
      isReady = true;
      console.log('[whatsapp] Conectado');
    }

    if (connection === 'close') {
      isReady = false;
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('[whatsapp] Desconectado, razon:', reason);
      if (reason !== DisconnectReason.loggedOut) {
        console.log('[whatsapp] Reconectando en 10s...');
        setTimeout(() => initWhatsApp(), 10000);
      } else {
        console.log('[whatsapp] Sesion cerrada — requiere nuevo pairing code');
      }
    }
  });

  sock = socket;

  socket.ev.on('messages.upsert', ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const msg of msgs) handleIncomingMessage(msg).catch(() => {});
  });

  // Pairing por numero de telefono — se solicita ANTES de que el socket abra
  const phone = process.env.WA_PHONE_NUMBER;
  if (!state.creds.registered && phone) {
    try {
      const code = await socket.requestPairingCode(phone);
      pairingCode = code;
      lastError = null;
      console.log('[whatsapp] PAIRING CODE:', code, '— ingresar en WhatsApp > Dispositivos vinculados > Vincular con numero de telefono');
    } catch (err) {
      lastError = (err.stack || err.message).substring(0, 500);
      console.log('[whatsapp] Error solicitando pairing code:', err.stack || err.message);
    }
  }
}

// to: numero de telefono (ej: 59172003024) o ID de grupo (ej: 120363XXX@g.us)
// Si no se pasa, usa WA_GROUP_ID del entorno
async function sendMessage(message, to = null) {
  if (!sock || !isReady) throw new Error('WhatsApp no conectado');
  let destination = to;
  if (!destination) {
    destination = process.env.WA_GROUP_ID;
    if (!destination) throw new Error('WA_GROUP_ID no configurado');
  }
  // Si es numero de telefono sin @, agregar sufijo de WhatsApp
  if (!destination.includes('@')) {
    destination = `${destination}@s.whatsapp.net`;
  }
  await sock.sendMessage(destination, { text: message });
}

function getStatus() {
  return { isReady, hasQr: !!qrData, hasPairingCode: !!pairingCode, initCalled, credsRegistered, lastError };
}

function getQr() {
  return qrData;
}

function getPairingCode() {
  return pairingCode;
}

async function getGroups() {
  if (!sock || !isReady) throw new Error('WhatsApp no conectado');
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
}

async function resetSession() {
  const { rows } = await dbClient.execute("SELECT key FROM config WHERE key LIKE 'wa_%'");
  for (const row of rows) {
    await removeData(row.key);
  }
  if (sock) {
    try { sock.end(); } catch {}
    sock = null;
  }
  isReady = false;
  pairingCode = null;
  qrData = null;
  console.log('[whatsapp] Sesion borrada — reiniciar servidor para reconectar');
}

async function refreshPairingCode() {
  if (!sock) throw new Error('WhatsApp no inicializado');
  const phone = process.env.WA_PHONE_NUMBER;
  if (!phone) throw new Error('WA_PHONE_NUMBER no configurado');
  const code = await sock.requestPairingCode(phone);
  pairingCode = code;
  console.log('[whatsapp] PAIRING CODE (refresh):', code);
  return code;
}

module.exports = { initWhatsApp, sendMessage, getStatus, getQr, getPairingCode, getGroups, refreshPairingCode, resetSession };
