if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const baileysConn = require('./lib/baileysConn');
const { handleMessage } = require('./lib/commandHandler');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*' },
});

app.get('/', (req, res) => res.send('Bot WhatsApp server berjalan.'));

app.get('/api/status', (req, res) => {
  res.json({ connected: baileysConn.getStatus() });
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
    await baileysConn.startConnection(io, handleMessage);
    res.json({ message: 'QR sedang dibuat, cek event socket.io "status".' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  baileysConn.logout();
  res.json({ message: 'Logout berhasil, sesi dihapus.' });
});

io.on('connection', (socket) => {
  socket.emit('status', { status: baileysConn.getStatus() ? 'connected' : 'idle' });
});

function hasSavedSession() {
  try {
    const file = path.join(__dirname, 'auth_session', 'creds.json');
    const creds = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Boolean(creds.registered || creds.account);
  } catch (e) {
    return false;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  // kalau sesi login masih tersimpan, bot langsung tersambung tanpa perlu buka web
  if (hasSavedSession()) {
    baileysConn.startConnection(io, handleMessage).catch((e) => console.error(e));
  }
});
