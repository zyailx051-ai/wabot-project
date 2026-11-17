const { setGroupSetting, getGroupSettings } = require('../lib/store');

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

async function cmdGroupOpenClose(sock, msg, jid, senderJid, mode) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  await sock.groupSettingUpdate(jid, mode === 'open' ? 'not_announcement' : 'announcement');
  await sock.sendMessage(jid, { text: `✅ Grup sekarang *${mode === 'open' ? 'terbuka' : 'tertutup'}* (cuma admin yang bisa chat kalau tertutup).` }, { quoted: msg });
}

async function handleGroupParticipantsUpdate(sock, event) {
  const { id: jid, participants, action } = event;
  const settings = getGroupSettings(jid);
  if (!settings.welcome) return;
  for (const p of participants) {
    const name = p.split('@')[0];
    if (action === 'add') {
      await sock.sendMessage(jid, { text: `👋 Selamat datang @${name} di grup!`, mentions: [p] });
    } else if (action === 'remove') {
      await sock.sendMessage(jid, { text: `👋 @${name} telah meninggalkan grup.`, mentions: [p] });
    }
  }
}

async function checkAntilink(sock, msg, jid, senderJid, text) {
  if (!jid.endsWith('@g.us')) return false;
  const settings = getGroupSettings(jid);
  if (!settings.antilink) return false;
  const linkRegex = /(chat\.whatsapp\.com|https?:\/\/)/i;
  if (!linkRegex.test(text)) return false;

  const senderIsAdmin = await isSenderAdmin(sock, jid, senderJid).catch(() => false);
  if (senderIsAdmin) return false;

  try {
    await sock.sendMessage(jid, { delete: msg.key });
    await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
    await sock.sendMessage(jid, { text: `🚫 Link terdeteksi, member dikeluarkan.` });
  } catch (e) {
    await sock.sendMessage(jid, { text: `⚠️ Terdeteksi link, tapi bot bukan admin jadi nggak bisa tindak lanjut.` });
  }
  return true;
}

module.exports = {
  cmdKick,
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
