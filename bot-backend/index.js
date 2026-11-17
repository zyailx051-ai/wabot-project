require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const baileysConn = require('./lib/baileysConn');
const { handleMessage } = require('./lib/commandHandler');
const { handleGroupParticipantsUpdate } = require('./commands/group');

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
  const sock = baileysConn.getSock();
  sock.ev.on('group-participants.update', (event) => handleGroupParticipantsUpdate(sock, event));
}

app.get('/api/status', (req, res) => {
  res.json({ connected: baileysConn.getStatus() });
});

app.post('/api/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber wajib diisi, contoh: 628123456789' });
  baileysConn.requestPairing(phoneNumber);
  if (!started) {
    started = true;
    await boot();
  } else {
    await baileysConn.startConnection(io, handleMessage);
  }
  res.json({ message: 'Pairing code sedang dibuat, cek event socket.io "status".' });
});

app.post('/api/connect-qr', async (req, res) => {
  if (!started) {
    started = true;
    await boot();
  }
  res.json({ message: 'QR sedang dibuat, cek event socket.io "status".' });
});

app.post('/api/logout', (req, res) => {
  baileysConn.logout();
  res.json({ message: 'Logout berhasil, sesi dihapus.' });
});

io.on('connection', (socket) => {
  socket.emit('status', { status: baileysConn.getStatus() ? 'connected' : 'idle' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
