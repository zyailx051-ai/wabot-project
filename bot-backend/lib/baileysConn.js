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
const stats = require('./stats');
const { getGroupSettings } = require('./store');
const aiCmd = require('../commands/ai');
const lidmap = require('./lidmap');
const quizCmd = require('../commands/quiz');
const sambungCmd = require('../commands/sambung');

function createConn(sessionId, AUTH_DIR) {
let linkingNew = false; // true kalau lagi proses tautan baru (QR / kode tautan muncul)

const logger = pino({ level: 'silent' });
const logBuf = [];
const log = (...a) => {
  console.log('[wa:' + sessionId.slice(0, 6) + ']', ...a);
  const line = a.map(String).join(' ').slice(0, 220);
  logBuf.push(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + '  ' + line);
  if (logBuf.length > 25) logBuf.shift();
  try { if (ioRef) ioRef.to(sessionId).emit('log', line); } catch (e) { /* abaikan */ }
};
let evId = 0;
let lastEv = null;

let sock = null;
let ioRef = null;
let pairingRequested = false;
let pairingNumber = null;
let isConnected = false;
let starting = false;
let manualStop = false;
let reconnectAttempts = 0;

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

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label + ' timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function emitStatus(status, extra = {}) {
  lastEv = { id: ++evId, status, ...extra };
  if (ioRef) ioRef.to(sessionId).emit('status', lastEv);
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

function hasSavedSession() {
  try {
    const file = path.join(AUTH_DIR, 'creds.json');
    const creds = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return isLinked(creds);
  } catch (e) {
    return false;
  }
}

async function startConnection(io, handleMessage) {
  ioRef = io;
  for (let i = 0; i < 75 && starting; i++) await new Promise((r) => setTimeout(r, 200));
  if (starting) {
    log('startConnection diabaikan: proses start sebelumnya masih jalan');
    return sock;
  }
  starting = true;
  log('memulai koneksi. mode:', pairingRequested ? 'pairing code' : 'qr/sesi tersimpan');

  let thisSock;
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const old = sock;
    sock = null;
    if (old) {
      try { old.end(undefined); } catch (e) { /* abaikan */ }
    }

    if (freshPending) {
      freshPending = false;
      if (!hasSavedSession()) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        log('sisa percobaan lama dibersihkan, mulai dari nol');
      }
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version;
    try {
      ({ version } = await withTimeout(fetchLatestBaileysVersion(), 8000, 'ambil versi'));
      log('versi WhatsApp Web:', Array.isArray(version) ? version.join('.') : version);
    } catch (e) {
      log('gagal ambil versi terbaru, pakai bawaan:', e.message);
    }

    thisSock = makeWASocket({
      ...(version ? { version } : {}),
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
    const origEnd = thisSock.end.bind(thisSock);
    thisSock.end = (err) => {
      log('end() dipanggil dari kode bot:', (new Error().stack || '').split('\n').slice(2, 5).map((x) => x.trim().replace(/^at /, '').slice(0, 60)).join(' < '));
      return origEnd(err);
    };

    const origSend = thisSock.sendMessage.bind(thisSock);
    thisSock.sendMessage = async (...args) => {
      const res = await origSend(...args);
      rememberSent(res);
      return res;
    };

    // Minta pairing code: begitu QR pertama muncul (socket siap), atau 4 detik kemudian.
    let codeRequested = false;
    const triggerCode = () => {
      if (codeRequested || isStale()) return;
      if (!pairingRequested || !pairingNumber || isLinked(thisSock.authState.creds)) return;
      codeRequested = true;
      (async () => {
        try {
          log('meminta pairing code untuk', pairingNumber);
          const code = await withTimeout(thisSock.requestPairingCode(pairingNumber), 25000, 'pairing code');
          log('pairing code berhasil dibuat');
          emitStatus('pairing_code', { code });
        } catch (err) {
          log('GAGAL membuat pairing code:', err.message);
          emitStatus('error', { message: 'Gagal membuat pairing code: ' + err.message });
        }
      })();
    };
    setTimeout(triggerCode, 4000);

    thisSock.ev.on('creds.update', saveCreds);

    thisSock.ev.on('connection.update', async (update) => {
      if (isStale()) return;
      const { connection, lastDisconnect, qr } = update;
      log('connection.update:', JSON.stringify({ connection: connection || null, qr: Boolean(qr) }));

      if (qr) {
        linkingNew = true;
        if (pairingRequested) {
          triggerCode();
        } else {
          try {
            const qrImage = await qrcode.toDataURL(qr);
            log('QR dibuat & dikirim ke web');
            emitStatus('qr', { qr: qrImage });
          } catch (e) {
            log('gagal membuat gambar QR:', e.message);
          }
        }
      }

      if (connection === 'open') {
        isConnected = true;
        pairingRequested = false;
        reconnectAttempts = 0;
        log('TERSAMBUNG ke WhatsApp');
        if (linkingNew) {
          linkingNew = false;
          try {
            const st = stats.incrementLinked();
            if (ioRef) ioRef.emit('stats', st);
          } catch (e) {
            log('gagal simpan statistik:', e.message);
          }
        }
        emitStatus('connected', { user: thisSock.user });
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        log('koneksi tertutup. kode:', statusCode, '| alasan:', lastDisconnect?.error?.message || String(lastDisconnect?.error || 'tidak ada (ditutup dari dalam)'), '| manualStop:', manualStop);
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          sock = null;
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          emitStatus('disconnected', { loggedOut: true });
        } else if (manualStop) {
          emitStatus('stopped');
        } else {
          reconnectAttempts += 1;
          if (reconnectAttempts > 8) {
            reconnectAttempts = 0;
            emitStatus('error', {
              message: `Gagal konek berulang (kode ${statusCode || '?'}). Tekan Start lagi, atau cek log Railway.`,
            });
            return;
          }
          if (statusCode === 405) {
            emitStatus('error', { message: 'WhatsApp menolak koneksi (405). Versi library Baileys mungkin perlu diupdate.' });
          } else {
            emitStatus('disconnected', { loggedOut: false, code: statusCode });
          }
          const delay = Math.min(30000, 3000 * 2 ** (reconnectAttempts - 1));
          log(`konek ulang dalam ${Math.round(delay / 1000)} detik (percobaan ${reconnectAttempts})`);
          setTimeout(() => {
            if (!isStale() && !manualStop) startConnection(io, handleMessage).catch((e) => log('gagal konek ulang:', e.message));
          }, delay);
        }
      }
    });

    thisSock.ev.on('contacts.upsert', (list) => lidmap.learnFromContacts(list));
    thisSock.ev.on('contacts.update', (list) => lidmap.learnFromContacts(list));
    thisSock.ev.on('group-participants.update', (event) => {
      if (isStale()) return;
      handleGroupParticipantsUpdate(thisSock, event).catch((e) => console.error('Group event error:', e));
    });

    thisSock.ev.on('messages.upsert', async (m) => {
      if (isStale()) return;
      try {
        for (const msg of m.messages || []) {
          if (!msg || !msg.message) continue;
          lidmap.learnFromKey(msg.key);
          if (msg.key.remoteJid === 'status@broadcast') continue;
          if (messageAgeSeconds(msg) > 60) continue;

          if (msg.key.fromMe) {
            if (sentCache.has(msg.key.id)) continue;
            const t = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const prefix = process.env.BOT_PREFIX || '.';
            if (!t.startsWith(prefix)) {
              // Mode .chatai on / game kuis & sambung kata: pesan biasa dari pemilik bot juga diproses (ditunda dikit biar balasan bot sendiri nggak ikut kehitung)
              const rj = msg.key.remoteJid;
              if (t && (getGroupSettings(rj).chatai || quizCmd.isActive(rj) || sambungCmd.isActive(rj)) && !aiCmd.isOwnReply(rj, t)) {
                if (msg.key.remoteJid.endsWith('@g.us') && !msg.key.participant) {
                  msg.key.participant = thisSock.user.id.replace(/:\d+@/, '@');
                }
                const delayed = msg;
                setTimeout(() => {
                  if (sentCache.has(delayed.key.id) || aiCmd.isOwnReply(delayed.key.remoteJid, t)) return;
                  handleMessage(thisSock, delayed, ioRef).catch((e) => console.error('chatai fromMe error:', e.message));
                }, 1500);
              }
              continue;
            }
            if (msg.key.remoteJid.endsWith('@g.us') && !msg.key.participant) {
              msg.key.participant = thisSock.user.id.replace(/:\d+@/, '@');
            }
          }

          await handleMessage(thisSock, msg, ioRef);
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
  } finally {
    starting = false;
  }
  return thisSock;
}

let freshPending = false;
function freshStart() {
  freshPending = true;
}

function requestPairing(number) {
  freshStart();
  manualStop = false;
  reconnectAttempts = 0;
  pairingRequested = true;
  pairingNumber = number.replace(/[^0-9]/g, '');
}

function requestQr() {
  freshStart();
  manualStop = false;
  reconnectAttempts = 0;
  pairingRequested = false;
  pairingNumber = null;
}

function resume() {
  manualStop = false;
  reconnectAttempts = 0;
  pairingRequested = false;
  pairingNumber = null;
}

function stopConnection() {
  manualStop = true;
  if (sock) {
    try { sock.end(undefined); } catch (e) { /* abaikan */ }
  }
  isConnected = false;
  emitStatus('stopped');
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
  manualStop = true;
  if (s) s.logout().catch(() => {});
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  isConnected = false;
  emitStatus('idle');
}


return {
  startConnection,
  requestPairing,
  requestQr,
  resume,
  stopConnection,
  getSock,
  getStatus,
  hasSavedSession,
  logout,
  getUser: () => (sock && isConnected ? sock.user : null),
  getLast: () => lastEv,
  getLogs: () => logBuf.slice(),
};
}

module.exports = { createConn };
    
