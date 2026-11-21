// Alat bantu grup yang dipakai bersama (antilink, antitagsw, cek admin).
// Mencocokkan pengguna lewat nomornya saja, jadi tetap cocok walau
// WhatsApp memakai bentuk ID berbeda (@s.whatsapp.net / @lid / ada sufiks :device).

const userPart = (jid) => String(jid || '').split('@')[0].split(':')[0];

function participantIds(p) {
  return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(userPart);
}

function findParticipant(meta, jid) {
  const u = userPart(jid);
  if (!u) return null;
  return (meta.participants || []).find((p) => participantIds(p).includes(u)) || null;
}

function isAdminOf(meta, jid) {
  const p = findParticipant(meta, jid);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

function botIsAdmin(sock, meta) {
  const ids = [sock.user?.id, sock.user?.lid].filter(Boolean);
  return ids.some((id) => isAdminOf(meta, id));
}

// Membaca argumen seperti "on", "off", "on --warn".
// HP sering mengubah "--" jadi "—", jadi itu ikut dikenali.
function parseToggle(argText) {
  const tokens = String(argText || '').toLowerCase().split(/\s+/).filter(Boolean);
  const mode = tokens.find((t) => t === 'on' || t === 'off') || null;
  const warn = tokens.some((t) => /^(--|—|–)?warn$/.test(t));
  return { mode, warn };
}

module.exports = { userPart, findParticipant, isAdminOf, botIsAdmin, parseToggle };
          
