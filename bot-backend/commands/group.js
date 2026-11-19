const { setGroupSetting, getGroupSettings } = require('../lib/store');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

async function isSenderAdmin(sock, jid, senderJid) {
  const meta = await sock.groupMetadata(jid);
  const participant = meta.participants.find((p) => p.id === senderJid);
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

async function requireGroupAdmin(sock, msg, jid, senderJid) {
  if (!jid.endsWith('@g.us')) {
    await sock.sendMessage(jid, { text: 'Perintah ini cuma bisa dipakai di dalam grup.' }, { quoted: msg });
    return false;
  }
  const ok = await isSenderAdmin(sock, jid, senderJid);
  if (!ok) {
    await sock.sendMessage(jid, { text: '❌ Cuma admin grup yang boleh pakai perintah ini.' }, { quoted: msg });
    return false;
  }
  return true;
}

function getMentionedOrQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length) return mentioned;
  if (ctx?.participant) return [ctx.participant];
  return [];
}

async function cmdKick(sock, msg, jid, senderJid) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const targets = getMentionedOrQuoted(msg);
  if (!targets.length) return sock.sendMessage(jid, { text: 'Tag atau reply orang yang mau dikeluarkan. Contoh: *.kick @user*' }, { quoted: msg });
  await sock.groupParticipantsUpdate(jid, targets, 'remove');
  await sock.sendMessage(jid, { text: '✅ Berhasil mengeluarkan member.' }, { quoted: msg });
}

async function cmdAdd(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const number = text.replace(/[^0-9]/g, '');
  if (!number) return sock.sendMessage(jid, { text: 'Contoh: *.add 628xxxxxxxxxx*' }, { quoted: msg });
  const targetJid = number + '@s.whatsapp.net';
  await sock.groupParticipantsUpdate(jid, [targetJid], 'add');
  await sock.sendMessage(jid, { text: '✅ Berhasil menambahkan member.' }, { quoted: msg });
}

async function cmdPromote(sock, msg, jid, senderJid) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const targets = getMentionedOrQuoted(msg);
  if (!targets.length) return sock.sendMessage(jid, { text: 'Tag/reply orang yang mau dijadikan admin.' }, { quoted: msg });
  await sock.groupParticipantsUpdate(jid, targets, 'promote');
  await sock.sendMessage(jid, { text: '✅ Berhasil menjadikan admin.' }, { quoted: msg });
}

async function cmdDemote(sock, msg, jid, senderJid) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const targets = getMentionedOrQuoted(msg);
  if (!targets.length) return sock.sendMessage(jid, { text: 'Tag/reply admin yang mau diturunkan.' }, { quoted: msg });
  await sock.groupParticipantsUpdate(jid, targets, 'demote');
  await sock.sendMessage(jid, { text: '✅ Berhasil menurunkan admin.' }, { quoted: msg });
}

async function cmdHidetag(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const meta = await sock.groupMetadata(jid);
  const mentions = meta.participants.map((p) => p.id);
  await sock.sendMessage(jid, { text: text || '📢 Pengumuman', mentions }, { quoted: msg });
}

async function cmdAntilink(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const mode = text.trim().toLowerCase();
  if (!['on', 'off'].includes(mode)) return sock.sendMessage(jid, { text: 'Contoh: *.antilink on* atau *.antilink off*' }, { quoted: msg });
  setGroupSetting(jid, 'antilink', mode === 'on');
  await sock.sendMessage(jid, { text: `✅ Antilink di-${mode === 'on' ? 'aktifkan' : 'matikan'}.` }, { quoted: msg });
}

async function cmdWelcome(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const mode = text.trim().toLowerCase();
  if (!['on', 'off'].includes(mode)) return sock.sendMessage(jid, { text: 'Contoh: *.welcome on* atau *.welcome off*' }, { quoted: msg });
  setGroupSetting(jid, 'welcome', mode === 'on');
  await sock.sendMessage(jid, { text: `✅ Welcome message di-${mode === 'on' ? 'aktifkan' : 'matikan'}.` }, { quoted: msg });
}

async function cmdSetWelcome(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  if (!text.trim()) {
    return sock.sendMessage(
      jid,
      { text: 'Contoh: *.setwelcome Halo {user}, selamat datang di {group}!*\n\nPakai {user} untuk nama member dan {group} untuk nama grup.' },
      { quoted: msg }
    );
  }
  setGroupSetting(jid, 'welcomeText', text.trim());
  setGroupSetting(jid, 'welcome', true);
  await sock.sendMessage(jid, { text: '✅ Pesan welcome custom disimpan & diaktifkan.' }, { quoted: msg });
}

async function cmdSetDeskripsi(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  if (!text.trim()) return sock.sendMessage(jid, { text: 'Contoh: *.setdeskripsi Grup ini untuk diskusi santai*' }, { quoted: msg });
  await sock.groupUpdateDescription(jid, text.trim());
  await sock.sendMessage(jid, { text: '✅ Deskripsi grup berhasil diubah.' }, { quoted: msg });
}

async function cmdSwgc(sock, msg, jid, senderJid, captionText) {
  if (!jid.endsWith('@g.us')) {
    return sock.sendMessage(
      jid,
      { text: 'Perintah ini cuma bisa dipakai di dalam grup. Kirim/reply foto atau video dengan caption *.swgc* untuk dijadikan Status WA, otomatis bisa dilihat semua member grup ini.' },
      { quoted: msg }
    );
  }
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || (media.type !== 'imageMessage' && media.type !== 'videoMessage')) {
    return sock.sendMessage(jid, { text: 'Kirim/reply foto atau video dengan caption *.swgc*' }, { quoted: msg });
  }

  let meta;
  try {
    meta = await sock.groupMetadata(jid);
  } catch (e) {
    return sock.sendMessage(jid, { text: '❌ Gagal ambil daftar member grup.' }, { quoted: msg });
  }

  const myId = sock.user.id.replace(/:\d+@/, '@');
  const statusJidList = meta.participants.map((p) => p.id).filter((id) => id !== myId);
  if (!statusJidList.length) {
    return sock.sendMessage(jid, { text: '❌ Nggak ada member lain di grup ini buat jadi penerima status.' }, { quoted: msg });
  }

  const content =
    media.type === 'videoMessage'
      ? { video: media.buffer, caption: captionText || '' }
      : { image: media.buffer, caption: captionText || '' };

  await sock.sendMessage('status@broadcast', content, {
    backgroundColor: '#25D366',
    font: 1,
    statusJidList,
    broadcast: true,
  });

  await sock.sendMessage(
    jid,
    { text: `✅ Berhasil diposting ke Status WA, otomatis bisa dilihat oleh ${statusJidList.length} member grup ini.` },
    { quoted: msg }
  );
}

async function cmdGroupOpenClose(sock, msg, jid, senderJid, mode) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  await sock.groupSettingUpdate(jid, mode === 'open' ? 'not_announcement' : 'announcement');
  await sock.sendMessage(jid, { text: `✅ Grup sekarang *${mode === 'open' ? 'terbuka' : 'tertutup'}* (cuma admin yang bisa chat kalau tertutup).` }, { quoted: msg });
}

// Dipanggil dari index.js saat ada event 'group-participants.update' (join/leave)
async function handleGroupParticipantsUpdate(sock, event) {
  const { id: jid, participants, action } = event;
  const settings = getGroupSettings(jid);
  if (!settings.welcome) return;
  let groupName = '';
  try {
    const meta = await sock.groupMetadata(jid);
    groupName = meta.subject || '';
  } catch (e) {
    // abaikan kalau gagal ambil nama grup
  }
  for (const p of participants) {
    const name = p.split('@')[0];
    if (action === 'add') {
      const template = settings.welcomeText || '👋 Selamat datang @{user} di grup {group}!';
      const text = template.replace(/\{user\}/g, name).replace(/\{group\}/g, groupName);
      await sock.sendMessage(jid, { text, mentions: [p] });
    } else if (action === 'remove') {
      await sock.sendMessage(jid, { text: `👋 @${name} telah meninggalkan grup.`, mentions: [p] });
    }
  }
}

// Dipanggil dari commandHandler untuk setiap pesan masuk di grup, cek antilink
async function checkAntilink(sock, msg, jid, senderJid, text) {
  if (!jid.endsWith('@g.us')) return false;
  const settings = getGroupSettings(jid);
  if (!settings.antilink) return false;
  const linkRegex = /(chat\.whatsapp\.com|https?:\/\/)/i;
  if (!linkRegex.test(text)) return false;

  const senderIsAdmin = await isSenderAdmin(sock, jid, senderJid).catch(() => false);
  if (senderIsAdmin) return false; // admin boleh kirim link

  try {
    await sock.sendMessage(jid, { delete: msg.key });
    await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
    await sock.sendMessage(jid, { text: `🚫 Link terdeteksi, member dikeluarkan.` });
  } catch (e) {
    // bot mungkin bukan admin, jadi cuma kasih peringatan
    await sock.sendMessage(jid, { text: `⚠️ Terdeteksi link, tapi bot bukan admin jadi nggak bisa tindak lanjut.` });
  }
  return true;
}

module.exports = {
  cmdKick,
  cmdSwgc,
  cmdSetWelcome,
  cmdSetDeskripsi,
  cmdAdd,
  cmdPromote,
  cmdDemote,
  cmdHidetag,
  cmdAntilink,
  cmdWelcome,
  cmdGroupOpenClose,
  handleGroupParticipantsUpdate,
  checkAntilink,
};
