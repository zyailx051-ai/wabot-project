const fs = require('fs');
const path = require('path');
const { createConn } = require('./baileysConn');

const ROOT = path.join(__dirname, '..');
const MAIN_DIR = path.join(ROOT, 'auth_session'); // sesi milik pemilik bot (tetap seperti dulu)
const USERS_DIR = path.join(ROOT, 'auth_sessions'); // sesi pengguna web: auth_sessions/<id>
const MAX = Number(process.env.MAX_SESSIONS || 100);
const map = new Map();

const valid = (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id);

function get(id = 'main') {
  if (!map.has(id)) {
    if (id !== 'main' && map.size >= MAX) return null;
    map.set(id, createConn(id, id === 'main' ? MAIN_DIR : path.join(USERS_DIR, id)));
  }
  return map.get(id);
}
const peek = (id) => map.get(id);
const drop = (id) => { if (id !== 'main') map.delete(id); };
function savedIds() {
  try {
    return fs.readdirSync(USERS_DIR).filter((id) => {
      if (!valid(id)) return false;
      try { // hanya sesi yang benar-benar sudah tertaut; sisa percobaan yang gagal dibersihkan
        const c = JSON.parse(fs.readFileSync(path.join(USERS_DIR, id, 'creds.json'), 'utf-8'));
        if (c && c.me && c.account) return true;
      } catch (e) { /* abaikan */ }
      fs.rmSync(path.join(USERS_DIR, id), { recursive: true, force: true });
      return false;
    });
  } catch (e) { return []; }
}
const activeCount = () => [...map.values()].filter((c) => c.getStatus()).length;

module.exports = { get, peek, drop, valid, savedIds, activeCount };
                           
