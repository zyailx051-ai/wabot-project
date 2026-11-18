const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '..', 'auth_session');

let sock = null;
let ioRef = null;
let pairingRequested = false;
let pairingNumber = null;
let isConnected = false;

function emitStatus(status, extra = {}) {
  if (ioRef) ioRef.emit('status', { status, ...extra });
}

async function startConnection(io, handleMessage) {
  ioRef = io;
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
  });

  if (pairingRequested && !sock.authState.creds.registered && pairingNumber) {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const code = await sock.requestPairingCode(pairingNumber);
      emitStatus('pairing_code', { code });
    } catch (err) {
      emitStatus('error', { message: 'Gagal membuat pairing code: ' + err.message });
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingRequested) {
      const qrImage = await qrcode.toDataURL(qr);
      emitStatus('qr', { qr: qrImage });
    }

    if (connection === 'open') {
      isConnected = true;
      pairingRequested = false;
      emitStatus('connected', { user: sock.user });
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      emitStatus('disconnected', { loggedOut });

      if (!loggedOut) {
        setTimeout(() => startConnection(io, handleMessage), 3000);
      } else {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages?.[0];
      if (!msg || !msg.message) return;

      if (msg.key.fromMe) {
        // Pesan dari nomor bot sendiri: cuma proses kalau diawali prefix perintah
        const t = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const prefix = process.env.BOT_PREFIX || '.';
        if (!t.startsWith(prefix)) return;
        if (msg.key.remoteJid.endsWith('@g.us')) {
          msg.key.participant = sock.user.id.replace(/:\d+@/, '@');
        }
      }

      await handleMessage(sock, msg);
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  return sock;
}

function requestPairing(number) {
  pairingRequested = true;
  pairingNumber = number.replace(/[^0-9]/g, '');
}

function getSock() {
  return sock;
}

function getStatus() {
  return isConnected;
}

function logout() {
  if (sock) sock.logout().catch(() => {});
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  isConnected = false;
}

module.exports = { startConnection, requestPairing, getSock, getStatus, logout };
