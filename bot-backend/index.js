if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const sessions = require('./lib/sessionManager');
const baileysConn = sessions.get('main'); // sesi pemilik (dashboard lama tetap jalan)
const { handleMessage } = require('./lib/commandHandler');
const { getSettings, setSettings } = require('./lib/settings');
const { getStats } = require('./lib/stats');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*' },
});

let started = false;

async function boot() {
  await baileysConn.startConnection(io, handleMessage);
}

app.get('/', (req, res) => res.send('Bot WhatsApp server berjalan.'));

app.get('/api/stats', (req, res) => res.json(getStats()));

app.get('/api/status', (req, res) => {
  const settings = getSettings();
  res.json({ connected: baileysConn.getStatus(), hasSession: baileysConn.hasSavedSession(), ...settings });
});

// "Start" / "Lanjut": kalau sesi udah ada, langsung konek ulang tanpa perlu nomor.
// Kalau belum ada sesi, phoneNumber wajib diisi untuk minta pairing code.
app.post('/api/start', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    if (baileysConn.getStatus()) {
      io.emit('status', { status: 'connected' });
      return res.json({ message: 'Bot sudah tersambung.' });
    }
    if (baileysConn.hasSavedSession()) {
      baileysConn.resume();
    } else {
      if (!phoneNumber) return res.status(400).json({ error: 'Nomor WA wajib diisi untuk pertama kali konek.' });
      baileysConn.requestPairing(phoneNumber);
    }
    if (!started) {
      started = true;
    }
    await baileysConn.startConnection(io, handleMessage);
    res.json({ message: 'Memulai koneksi...' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pair', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber wajib diisi, contoh: 628123456789' });
    if (baileysConn.getStatus()) {
      io.emit('status', { status: 'connected' });
      return res.json({ message: 'Bot sudah tersambung ke WhatsApp.' });
    }
    baileysConn.requestPairing(phoneNumber);
    started = true;
    await baileysConn.startConnection(io, handleMessage);
    res.json({ message: 'Pairing code sedang dibuat, cek event socket.io "status".' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect-qr', async (req, res) => {
  try {
    if (baileysConn.getStatus()) {
      io.emit('status', { status: 'connected' });
      return res.json({ message: 'Bot sudah tersambung ke WhatsApp.' });
    }
    baileysConn.requestQr();
    started = true;
    await baileysConn.startConnection(io, handleMessage);
    res.json({ message: 'QR sedang dibuat, cek event socket.io "status".' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// "Stop": putus koneksi tapi sesi login TETAP disimpan, bisa di-"Start" lagi tanpa scan ulang.
app.post('/api/stop', (req, res) => {
  baileysConn.stopConnection();
  res.json({ message: 'Bot dihentikan. Sesi login masih tersimpan.' });
});

// "Hapus Sesi": putus koneksi DAN hapus sesi login, wajib pairing/scan ulang.
app.post('/api/clear-session', (req, res) => {
  baileysConn.logout();
  res.json({ message: 'Sesi dihapus. Perlu pairing/scan ulang.' });
});

// backward-compat
app.post('/api/logout', (req, res) => {
  baileysConn.logout();
  res.json({ message: 'Logout berhasil, sesi dihapus.' });
});

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  const { enabled, runMode } = req.body || {};
  const patch = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (['both', 'group', 'dm'].includes(runMode)) patch.runMode = runMode;
  const updated = setSettings(patch);
  io.emit('settings', updated);
  res.json(updated);
});

// ===== Multi-user: tiap pengunjung web punya sesi sendiri (sid acak yang disimpan di browser) =====
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}
function sess(req, res) {
  const sid = (req.body && req.body.sid) || req.query.sid;
  if (!sessions.valid(sid)) { res.status(400).json({ error: 'sid tidak valid' }); return null; }
  const c = sessions.get(sid);
  if (!c) { res.status(503).json({ error: 'Server penuh, coba lagi nanti.' }); return null; }
  return { sid, c };
}

app.get('/api/s/status', (req, res) => {
  const sid = req.query.sid;
  if (!sessions.valid(sid)) return res.status(400).json({ error: 'sid tidak valid' });
  const c = sessions.peek(sid);
  res.json({ connected: c ? c.getStatus() : false, hasSession: c ? c.hasSavedSession() : false, user: c ? c.getUser() : null, last: c ? c.getLast() : null, logs: c ? c.getLogs() : [] });
});

app.post('/api/s/start', async (req, res) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: 'Terlalu sering, tunggu sebentar.' });
    const s = sess(req, res);
    if (!s) return;
    const { sid, c } = s;
    const { method, phoneNumber } = req.body || {};
    if (c.getStatus()) { io.to(sid).emit('status', { status: 'connected', user: c.getUser() }); return res.json({ message: 'Sudah tersambung.' }); }
    if (c.hasSavedSession()) c.resume();
    else if (method === 'qr') c.requestQr();
    else {
      const n = String(phoneNumber || '').replace(/\D/g, '');
      if (n.length < 8 || n.length > 16) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid.' });
      c.requestPairing(n);
    }
    await c.startConnection(io, handleMessage);
    res.json({ message: 'Memulai koneksi...' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/s/stop', (req, res) => {
  const s = sess(req, res);
  if (!s) return;
  s.c.stopConnection();
  res.json({ message: 'Bot dihentikan. Sesi masih tersimpan.' });
});

app.post('/api/s/clear', (req, res) => {
  const s = sess(req, res);
  if (!s) return;
  s.c.logout();
  sessions.drop(s.sid);
  res.json({ message: 'Sesi dihapus.' });
});

io.on('connection', (socket) => {
  // Tanpa sid = dashboard pemilik (sesi 'main'). Dengan sid = pengunjung web.
  const raw = socket.handshake.query && socket.handshake.query.sid;
  if (raw && !sessions.valid(String(raw))) return socket.disconnect();
  const sid = raw ? String(raw) : 'main';
  socket.join(sid);
  const c = sessions.peek(sid);
  socket.emit('status', { status: c && c.getStatus() ? 'connected' : 'idle', user: c ? c.getUser() : null, hasSession: c ? c.hasSavedSession() : false });
  socket.emit('settings', getSettings());
  socket.emit('stats', getStats());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT} | build multi-sesi v4`);
  if (baileysConn.hasSavedSession()) {
    started = true;
    baileysConn.resume();
    baileysConn.startConnection(io, handleMessage).catch((e) => console.error(e));
  }
  // pulihkan sesi pengguna web yang sudah tersambung sebelumnya (bertahap supaya server tidak kaget)
  sessions.savedIds().forEach((id, i) => {
    setTimeout(() => {
      const c = sessions.get(id);
      if (!c) return;
      c.resume();
      c.startConnection(io, handleMessage).catch((e) => console.error(e));
    }, 3000 * (i + 1));
  });
});
