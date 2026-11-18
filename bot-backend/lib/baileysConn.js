const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { handleGroupParticipantsUpdate } = require('../commands/group');

const AUTH_DIR = path.join(__dirname, '..', 'auth_session');
const logger = pino({ level: 'silent' });

let sock = null;
let ioRef = null;
let pairingRequested = false;
let pairingNumber = null;
let isConnected = false;
let starting = false;

// Simpan pesan yang dikirim bot supaya WhatsApp bisa minta kirim ulang
// (mencegah "Menunggu pesan ini").
const sentCache = new Map();
function rememberSent(res) {
  if (res && res.key && res.key.id && res.message) {
    sentCache.set(res.key.id, res.message);
    if (sentCache.size > 1000) sentCache.delete(sentCache.keys().next().value);
  }
}

const retryStore = new Map();
const msgRetryCounterCache = {
  get: (k) => retryStore.get(k),
  set: (k, v) => { retryStore.set(k, v); },
  del: (k) => { retryStore.delete(k); },
  flushAll: () => { retryStore.clear(); },
};

function emitStatus(status, extra = {}) {
  if (ioRef) ioRef.emit('status', { status, ...extra });
}

function messageAgeSeconds(msg) {
  const t = msg.messageTimestamp;
  const n = typeof t === 'number' ? t : t && typeof t.toNumber === 'function' ? t.toNumber() : Number(t);
  if (!n) return 0;
  return Date.now() / 1000 - n;
}

function isLinked(creds) {
  return Boolean(creds && (creds.registered || creds.account));
}

async function startConnection(io, handleMessage) {
  ioRef = io;
  if (starting) return sock;
  starting = true;

  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const old = sock;
    sock = null;
    if (old) {
      try { old.end(undefined); } catch (e) { /* abaikan */ }
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const thisSock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      msgRetryCounterCache,
      getMessage: async (key) => sentCache.get(key.id),
    });
    sock = thisSock;
    const isStale = () => thisSock !== sock;

    const origSend = thisSock.sendMessage.bind(thisSock);
    thisSock.sendMessage = async (...args) => {
      const res = await origSend(...args);
      rememberSent(res);
      return res;
    };

    thisSock.ev.on('creds.update', saveCreds);

    thisSock.ev.on('connection.update', async (update) => {
      if (isStale()) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr && !pairingRequested) {
        const qrImage = await qrcode.toDataURL(qr);
        emitStatus('qr', { qr: qrImage });
      }

      if (connection === 'open') {
        isConnected = true;
        pairingRequested = false;
        emitStatus('connected', { user: thisSock.user });
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        emitStatus('disconnected', { loggedOut });

        if (!loggedOut) {
          setTimeout(() => {
            if (!isStale()) startConnection(io, handleMessage).catch((e) => console.error(e));
          }, 3000);
        } else {
          sock = null;
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
      }
    });

    thisSock.ev.on('group-participants.update', (event) => {
      if (isStale()) return;
      handleGroupParticipantsUpdate(thisSock, event).catch((e) => console.error('Group event error:', e));
    });

    thisSock.ev.on('messages.upsert', async (m) => {
      if (isStale()) return;
      try {
        for (const msg of m.messages || []) {
          if (!msg || !msg.message) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;
          if (messageAgeSeconds(msg) > 60) continue; // abaikan pesan lama (history)

          if (msg.key.fromMe) {
            // jangan proses pesan yang dikirim bot sendiri
            if (sentCache.has(msg.key.id)) continue;
            // pesan dari nomor sendiri: hanya proses kalau diawali prefix perintah
            const t = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const prefix = process.env.BOT_PREFIX || '.';
            if (!t.startsWith(prefix)) continue;
            if (msg.key.remoteJid.endsWith('@g.us') && !msg.key.participant) {
              msg.key.participant = thisSock.user.id.replace(/:\d+@/, '@');
            }
          }

          await handleMessage(thisSock, msg);
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });

    // Minta pairing code (kalau diminta & belum tertaut)
    if (pairingRequested && !isLinked(thisSock.authState.creds) && pairingNumber) {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const code = await thisSock.requestPairingCode(pairingNumber);
        emitStatus('pairing_code', { code });
      } catch (err) {
        emitStatus('error', { message: 'Gagal membuat pairing code: ' + err.message });
      }
    }

    return thisSock;
  } finally {
    starting = false;
  }
}

function requestPairing(number) {
  pairingRequested = true;
  pairingNumber = number.replace(/[^0-9]/g, '');
}

function requestQr() {
  pairingRequested = false;
  pairingNumber = null;
}

function getSock() {
  return sock;
}

function getStatus() {
  return isConnected;
}

function logout() {
  const s = sock;
  sock = null;
  if (s) s.logout().catch(() => {});
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  isConnected = false;
}

module.exports = { startConnection, requestPairing, requestQr, getSock, getStatus, logout };
