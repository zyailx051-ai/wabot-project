const { getGroupSettings, setGroupSetting } = require('../lib/store');
const { isAdminOf, parseToggle } = require('../lib/groupUtils');
const { handleViolation, MAX_WARN } = require('../lib/moderation');

// Pesan "orang ini nge-tag grup di statusnya" punya tipe khusus di WhatsApp
// (groupStatusMentionMessage, atau protocolMessage bertipe STATUS_MENTION_MESSAGE).
// Fungsi ini mencarinya, termasuk di dalam pesan pembungkus.
function isStatusMention(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 4) return false;
  for (const key of Object.keys(message)) {
    if (/groupStatusMention|statusMentionMessage/i.test(key)) return true;
    const v = message[key];
    if (key === 'protocolMessage' && v && (v.type === 25 || v.type === 'STATUS_MENTION_MESSAGE')) return true;
    if (v && typeof v === 'object' && /message$/i.test(key) && isStatusMention(v, depth + 1)) return true;
  }
  return false;
}

// Tipe pesan biasa, tidak perlu dicatat di log
const COMMON = new Set([
  'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage',
  'stickerMessage', 'documentMessage', 'contactMessage', 'locationMessage', 'reactionMessage',
  'pollCreationMessage', 'pollUpdateMessage', 'messageContextInfo', 'senderKeyDistributionMessage',
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage',
  'protocolMessage', 'editedMessage', 'liveLocationMessage', 'contactsArrayMessage',
]);
const seenUnknown = new Set();

// Bantu diagnosa: catat sekali saja tiap tipe pesan yang tidak biasa (lihat di log Railway)
function logUnknown(message) {
  for (const key of Object.keys(message || {})) {
    if (COMMON.has(key) || seenUnknown.has(key)) continue;
    if (seenUnknown.size > 50) return;
    seenUnknown.add(key);
    console.log('[antitagsw] tipe pesan tidak umum diterima:', key);
  }
}

async function cmdAntiTagSw(sock, msg, jid, senderJid, argText) {
  if (!jid.endsWith('@g.us')) {
    return sock.sendMessage(jid, { text: 'Perintah ini cuma bisa dipakai di dalam grup.' }, { quoted: msg });
  }
  const meta = await sock.groupMetadata(jid);
  if (!isAdminOf(meta, senderJid)) {
    return sock.sendMessage(jid, { text: '❌ Cuma admin grup yang boleh pakai perintah ini.' }, { quoted: msg });
  }
  const { mode, warn } = parseToggle(argText);
  if (!mode) {
    const s = getGroupSettings(jid);
    const now = s.antitagsw ? (s.antitagswWarn ? `AKTIF + warn (${MAX_WARN}x = kick)` : 'AKTIF (hapus pesan saja)') : 'nonaktif';
    return sock.sendMessage(
      jid,
      { text: `Contoh:\n*.antitagsw on*  → hapus pesannya\n*.antitagsw on --warn*  → peringatan, ${MAX_WARN}x melanggar = dikeluarkan\n*.antitagsw off*\n\nStatus sekarang: ${now}` },
      { quoted: msg }
    );
  }
  setGroupSetting(jid, 'antitagsw', mode === 'on');
  setGroupSetting(jid, 'antitagswWarn', mode === 'on' && warn);
  const info =
    mode === 'on'
      ? warn
        ? `Mode *warn*: melanggar ${MAX_WARN}x = dikeluarkan.`
        : 'Pesannya akan dihapus.'
      : '';
  await sock.sendMessage(
    jid,
    { text: `✅ Anti tag status di-${mode === 'on' ? 'aktifkan' : 'matikan'}.\n${info}${mode === 'on' ? '\n_Bot harus jadi admin grup. Admin grup tidak kena._' : ''}`.trim() },
    { quoted: msg }
  );
}

// Dipanggil untuk setiap pesan masuk di grup. Mengembalikan true kalau pesannya ditangani.
async function checkAntiTagSw(sock, msg, jid, senderJid) {
  if (!jid.endsWith('@g.us')) return false;
  if (msg.key.fromMe) return false;
  const on = !!getGroupSettings(jid).antitagsw;
  if (!isStatusMention(msg.message)) {
    if (on) logUnknown(msg.message);
    return false;
  }
  console.log('[antitagsw] terdeteksi tag status dari', senderJid, '| fitur aktif:', on);
  if (!on) return false;
  return handleViolation(sock, msg, jid, senderJid, 'antitagsw', 'terdeteksi tag grup lewat status');
}

module.exports = { cmdAntiTagSw, checkAntiTagSw, isStatusMention };
