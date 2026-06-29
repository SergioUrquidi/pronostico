const { client: dbClient } = require('../db');

let sock = null;
let qrData = null;
let pairingCode = null;
let isReady = false;
let baileys = null;

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
  child: () => silentLogger,
};

async function initWhatsApp() {
  const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = await getBaileys();

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useTursoAuthState();

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

  // Pairing por numero de telefono si la sesion no esta registrada
  const phone = process.env.WA_PHONE_NUMBER;
  if (!state.creds.registered && phone) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const code = await socket.requestPairingCode(phone);
      pairingCode = code;
      console.log('[whatsapp] PAIRING CODE:', code, '— ingresar en WhatsApp > Dispositivos vinculados > Vincular con numero de telefono');
    } catch (err) {
      console.log('[whatsapp] Error solicitando pairing code:', err.message);
    }
  }
}

async function sendMessage(message) {
  if (!sock || !isReady) throw new Error('WhatsApp no conectado');
  const groupId = process.env.WA_GROUP_ID;
  if (!groupId) throw new Error('WA_GROUP_ID no configurado');
  await sock.sendMessage(groupId, { text: message });
}

function getStatus() {
  return { isReady, hasQr: !!qrData, hasPairingCode: !!pairingCode };
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

module.exports = { initWhatsApp, sendMessage, getStatus, getQr, getPairingCode, getGroups };
