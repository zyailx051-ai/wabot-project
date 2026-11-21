if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const baileysConn = require('./lib/baileysConn');
const { handleMessage } = require('./lib/commandHandler');
const { getSettings, setSettings } = require('./lib/settings');
const { getStats } = require('./lib/stats');

const app = express();
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

io.on('connection', (socket) => {
  socket.emit('status', { status: baileysConn.getStatus() ? 'connected' : 'idle' });
  socket.emit('settings', getSettings());
  socket.emit('stats', getStats());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  if (baileysConn.hasSavedSession()) {
    started = true;
    baileysConn.resume();
    baileysConn.startConnection(io, handleMessage).catch((e) => console.error(e));
  }
});
