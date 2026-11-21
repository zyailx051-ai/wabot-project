// Penindakan pelanggaran untuk antilink & antitagsw.
//  - tanpa --warn : antilink = hapus + langsung kick, antitagsw = hapus saja
//  - dengan --warn: hapus + peringatan, pelanggaran ke-3 = kick
const { getGroupSettings, addWarn, resetWarn } = require('./store');
const { userPart, findParticipant, isAdminOf, botIsAdmin } = require('./groupUtils');

const MAX_WARN = 3;
const lastNotice = new Map(); // supaya info "bot bukan admin" tidak membanjiri grup

async function handleViolation(sock, msg, jid, senderJid, kind, reason) {
  const tag = `[${kind}]`;
  const warnMode = !!getGroupSettings(jid)[kind + 'Warn'];

  let meta;
  try {
    meta = await sock.groupMetadata(jid);
  } catch (e) {
    console.error(tag, 'gagal ambil data grup:', e.message);
    return false;
  }

  if (isAdminOf(meta, senderJid)) {
    console.log(tag, 'dilewati: pengirim adalah admin grup', userPart(senderJid));
    return false;
  }

  const say = (text) => sock.sendMessage(jid, { text, mentions: [senderJid] }).catch(() => {});
  const who = '@' + userPart(senderJid);

  if (!botIsAdmin(sock, meta)) {
    console.log(tag, 'bot BUKAN admin grup, tidak bisa menghapus pesan');
    const now = Date.now();
    if (now - (lastNotice.get(jid) || 0) > 60000) {
      lastNotice.set(jid, now);
      await sock.sendMessage(jid, {
        text: `⚠️ ${reason}, tapi bot belum jadi *admin grup* jadi tidak bisa menghapus pesan atau mengeluarkan member. Jadikan bot admin dulu ya.`,
      }).catch(() => {});
    }
    return true;
  }

  try {
    await sock.sendMessage(jid, { delete: msg.key });
  } catch (e) {
    console.error(tag, 'gagal menghapus pesan:', e.message);
  }

  const kick = async () => {
    const target = findParticipant(meta, senderJid)?.id || senderJid;
    await sock.groupParticipantsUpdate(jid, [target], 'remove');
  };

  if (!warnMode) {
    if (kind === 'antilink') {
      try {
        await kick();
        await say(`🚫 ${who} ${reason}, pesan dihapus dan member dikeluarkan.`);
      } catch (e) {
        console.error(tag, 'gagal kick:', e.message);
        await say(`🚫 ${who} ${reason}, pesan dihapus.`);
      }
    } else {
      await say(`🚫 ${who} ${reason}, pesannya dihapus.`);
    }
    return true;
  }

  const user = userPart(senderJid);
  const count = addWarn(jid, kind, user);
  if (count >= MAX_WARN) {
    resetWarn(jid, kind, user);
    try {
      await kick();
      await say(`🚫 ${who} sudah melanggar ${MAX_WARN}x (${reason}), dikeluarkan dari grup.`);
    } catch (e) {
      console.error(tag, 'gagal kick:', e.message);
      await say(`🚫 ${who} sudah melanggar ${MAX_WARN}x tapi gagal dikeluarkan.`);
    }
  } else {
    await say(`⚠️ ${who} ${reason}, pesan dihapus.\nPeringatan *${count}/${MAX_WARN}*. Pelanggaran ke-${MAX_WARN} = dikeluarkan.`);
  }
  return true;
}

module.exports = { handleViolation, MAX_WARN };
    
