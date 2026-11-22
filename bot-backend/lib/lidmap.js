const fs = require('fs');
const path = require('path');

// Peta ID tersembunyi (LID) -> nomor telepon, dipelajari dari pesan/kontak yang masuk ke bot.
const FILE = path.join(__dirname, '..', 'data', 'lidmap.json');
const map = new Map();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf-8')))) map.set(k, v);
} catch (e) { /* belum ada */ }

let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(map)));
    } catch (e) { /* abaikan */ }
  }, 3000);
}

const norm = (j) => (j ? String(j).replace(/:\d+@/, '@') : '');
const isLid = (j) => /@lid$/.test(j || '');
const isPn = (j) => /@s\.whatsapp\.net$/.test(j || '');

function set(lid, pn) {
  lid = norm(lid); pn = norm(pn);
  if (!isLid(lid) || !isPn(pn)) return;
  if (map.get(lid) !== pn) { map.set(lid, pn); persist(); }
}

// Dari kunci pesan masuk
function learnFromKey(key) {
  if (!key) return;
  const lids = [key.participant, key.remoteJid, key.participantLid].filter(isLid);
  const pns = [key.participantPn, key.participantAlt, key.senderPn, key.remoteJidAlt, key.participant, key.remoteJid].filter(isPn);
  if (lids[0] && pns[0]) set(lids[0], pns[0]);
}

// Dari daftar kontak (id = nomor, lid = ID tersembunyi)
function learnFromContacts(list) {
  for (const c of list || []) {
    if (c?.id && c?.lid) set(c.lid, c.id);
    if (c?.id && c?.phoneNumber) set(c.id, c.phoneNumber);
  }
}

const toPN = (lid) => map.get(norm(lid)) || null;

module.exports = { learnFromKey, learnFromContacts, toPN, isLid, isPn, norm };
