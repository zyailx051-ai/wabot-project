const { getGroupSettings, setGroupSetting } = require('../lib/store');

async function isAdmin(sock, jid, senderJid) {
  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find((x) => x.id === senderJid);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

// Pesan "orang ini nge-tag grup di statusnya" punya tipe khusus di WhatsApp
// (groupStatusMentionMessage). Fungsi ini mencarinya, termasuk di dalam pesan pembungkus.
function isStatusMention(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 3) return false;
  for (const key of Object.keys(message)) {
    if (/groupStatusMention|statusMentionMessage/i.test(key)) return true;
    const v = message[key];
    if (v && typeof v === 'object' && /message$/i.test(key) && isStatusMention(v, depth + 1)) return true;
  }
  return false;
}

async function cmdAntiTagSw(sock, msg, jid, senderJid, argText) {
  if (!jid.endsWith('@g.us')) {
    return sock.sendMessage(jid, { text: 'Perintah ini cuma bisa dipakai di dalam grup.' }, { quoted: msg });
  }
  if (!(await isAdmin(sock, jid, senderJid))) {
    return sock.sendMessage(jid, { text: '❌ Cuma admin grup yang boleh pakai perintah ini.' }, { quoted: msg });
  }
  const mode = (argText || '').trim().toLowerCase();
  if (!['on', 'off'].includes(mode)) {
    const now = getGroupSettings(jid).antitagsw ? 'AKTIF' : 'nonaktif';
    return sock.sendMessage(jid, { text: `Contoh: *.antitagsw on* atau *.antitagsw off*\nStatus sekarang: ${now}` }, { quoted: msg });
  }
  setGroupSetting(jid, 'antitagsw', mode === 'on');
  await sock.sendMessage(
    jid,
    { text: `✅ Anti tag status di-${mode === 'on' ? 'aktifkan' : 'matikan'}.\n${mode === 'on' ? '_Bot harus jadi admin grup supaya bisa menghapus pesannya._' : ''}`.trim() },
    { quoted: msg }
  );
}

// Dipanggil untuk setiap pesan masuk di grup. Mengembalikan true kalau pesannya ditangani.
async function checkAntiTagSw(sock, msg, jid, senderJid) {
  if (!jid.endsWith('@g.us')) return false;
  if (msg.key.fromMe) return false;
  if (!isStatusMention(msg.message)) return false;
  if (!getGroupSettings(jid).antitagsw) return false;
  try {
    await sock.sendMessage(jid, { delete: msg.key });
    await sock.sendMessage(jid, {
      text: `🚫 @${String(senderJid).split('@')[0]} terdeteksi tag grup lewat status, pesannya dihapus.`,
      mentions: [senderJid],
    });
  } catch (e) {
    console.error('antitagsw gagal menghapus (bot mungkin bukan admin):', e.message);
  }
  return true;
}

module.exports = { cmdAntiTagSw, checkAntiTagSw, isStatusMention };
