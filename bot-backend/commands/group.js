const { setGroupSetting, getGroupSettings } = require('../lib/store');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');
const axios = require('axios');
const { proto, generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { makeCard } = require('./welcomecard');
const lidmap = require('../lib/lidmap');

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

async function cmdGoodbye(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  const mode = text.trim().toLowerCase();
  if (!['on', 'off'].includes(mode)) return sock.sendMessage(jid, { text: 'Contoh: *.goodbye on* atau *.goodbye off*' }, { quoted: msg });
  setGroupSetting(jid, 'goodbye', mode === 'on');
  await sock.sendMessage(jid, { text: `✅ Kartu goodbye di-${mode === 'on' ? 'aktifkan' : 'matikan'}.` }, { quoted: msg });
}

async function cmdSetWelcome(sock, msg, jid, senderJid, text) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  if (!text.trim()) {
    return sock.sendMessage(
      jid,
      { text: 'Contoh: *.setwelcome Halo {user}, selamat datang di {group}! Kamu member ke-{member}*\n\n*{user}* = tag member baru\n*{namagrup}* atau *{group}* = nama grup\n*{member}* = nomor urut member' },
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

async function resolvePN(sock, p) {
  for (const c of [p.phoneNumber, p.jid, p.id]) if (lidmap.isPn(c)) return lidmap.norm(c);
  const known = lidmap.toPN(p.id);
  if (known) return known;
  try {
    const r = await sock.signalRepository?.lidMapping?.getPNForLID?.(p.id);
    if (r) return lidmap.norm(r);
  } catch (e) { /* belum ada pemetaan */ }
  return null;
}

async function cmdSwgc(sock, msg, jid, senderJid, captionText) {
  if (!jid.endsWith('@g.us')) {
    return sock.sendMessage(jid, { text: 'Perintah ini cuma bisa dipakai di dalam grup. Kirim/reply foto atau video dengan caption *.swgc*.' }, { quoted: msg });
  }
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || (media.type !== 'imageMessage' && media.type !== 'videoMessage')) {
    return sock.sendMessage(jid, { text: 'Kirim/reply foto atau video dengan caption *.swgc* (bisa tambah teks: *.swgc halo semua*)' }, { quoted: msg });
  }
  const caption = (captionText || '').trim();
  const content = media.type === 'videoMessage' ? { video: media.buffer, caption } : { image: media.buffer, caption };

  // 1) Status Grup asli (kalau versi Baileys mendukung)
  if (proto?.Message?.prototype && 'groupStatusMessageV2' in proto.Message.prototype) {
    try {
      const inner = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
      const wrapped = generateWAMessageFromContent(jid, { groupStatusMessageV2: { message: inner } }, { userJid: sock.user.id });
      await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
      return sock.sendMessage(jid, { text: '✅ Berhasil diposting ke *Status Grup*.' }, { quoted: msg });
    } catch (e) {
      console.error('[swgc] status grup gagal, coba cara Status WA:', e.message);
    }
  }

  // 2) Posting ke Status WA bot, ditujukan ke member grup.
  let meta;
  try {
    meta = await sock.groupMetadata(jid);
  } catch (e) {
    return sock.sendMessage(jid, { text: '❌ Gagal ambil daftar member grup.' }, { quoted: msg });
  }
  const mine = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(lidmap.norm));
  const pnList = [];
  const lidList = [];
  for (const p of meta.participants) {
    if (mine.has(lidmap.norm(p.id)) || mine.has(lidmap.norm(p.phoneNumber)) || mine.has(lidmap.norm(p.lid))) continue;
    const pn = await resolvePN(sock, p);
    if (pn) { if (!mine.has(pn)) pnList.push(pn); }
    else if (lidmap.isLid(p.id)) lidList.push(lidmap.norm(p.id));
  }
  const uniq = (a) => [...new Set(a)];
  const pns = uniq(pnList);
  const lids = uniq(lidList);
  if (!pns.length && !lids.length) {
    return sock.sendMessage(jid, { text: '❌ Nggak ada member lain di grup ini buat jadi penerima status.' }, { quoted: msg });
  }

  // coba: semua (nomor + ID tersembunyi) -> hanya nomor -> hanya ID tersembunyi
  const attempts = [[...pns, ...lids], pns, lids].filter((l, i, arr) => l.length && arr.findIndex((x) => x.join() === l.join()) === i);
  let used = null;
  let lastErr = null;
  for (const list of attempts) {
    try {
      await sock.sendMessage('status@broadcast', content, { statusJidList: list, broadcast: true });
      used = list;
      break;
    } catch (e) {
      lastErr = e;
      console.error(`[swgc] gagal kirim status ke ${list.length} penerima:`, e.message);
    }
  }
  if (!used) return sock.sendMessage(jid, { text: '❌ Gagal posting status: ' + (lastErr?.message || 'tidak diketahui') }, { quoted: msg });

  let t = `✅ Status diposting & dikirim ke ${used.length} member grup.\n(Lihat di tab Pembaruan/Status.)`;
  const hidden = used.filter(lidmap.isLid).length;
  if (hidden) t += `\n\nℹ️ ${hidden} member memakai ID tersembunyi, mungkin belum menerima. Mereka otomatis dikenali setelah mengirim pesan di grup ini lalu coba *.swgc* lagi.`;
  return sock.sendMessage(jid, { text: t }, { quoted: msg });
}

async function cmdGroupOpenClose(sock, msg, jid, senderJid, mode) {
  if (!(await requireGroupAdmin(sock, msg, jid, senderJid))) return;
  await sock.groupSettingUpdate(jid, mode === 'open' ? 'not_announcement' : 'announcement');
  await sock.sendMessage(jid, { text: `✅ Grup sekarang *${mode === 'open' ? 'terbuka' : 'tertutup'}* (cuma admin yang bisa chat kalau tertutup).` }, { quoted: msg });
}

// Dipanggil saat ada event 'group-participants.update' (join/leave)
// Placeholder welcome: {user} = tag member baru, {group} = tag grup, {namagrup} = nama grup biasa, {member} = nomor urut member
async function fetchAvatar(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(r.data);
  } catch (e) {
    return null; // foto profil privat / nggak ada
  }
}

async function handleGroupParticipantsUpdate(sock, event) {
  const { id: jid, participants, action } = event;
  const settings = getGroupSettings(jid);
  if (settings.antikudeta && ['remove', 'promote', 'demote'].includes(action)) {
    await require('./antikudeta').handleEvent(sock, event).catch((e) => console.error('[antikudeta] error:', e.message));
  }
  if (action === 'add' && !settings.welcome) return;
  if (action === 'remove' && !settings.goodbye) return;
  if (action !== 'add' && action !== 'remove') return;
  let groupName = '';
  let total = 0;
  try {
    const meta = await sock.groupMetadata(jid);
    groupName = meta.subject || '';
    total = (meta.participants || []).length;
  } catch (e) {
    // abaikan kalau gagal ambil data grup
  }
  const idOf = (p) => (typeof p === 'string' ? p : p?.phoneNumber || p?.id || '');
  const list = (participants || []).map(idOf).filter(Boolean);

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const name = p.split('@')[0];
    const pn = p.endsWith('@lid') ? lidmap.toPN(p) : p;
    const shown = pn ? '+' + pn.split('@')[0] : 'Member baru';
    const nomor = total ? total - (list.length - 1 - i) : '?';

    let text;
    if (action === 'add') {
      const template = settings.welcomeText || '👋 Selamat datang {user} di grup *{namagrup}*!\nKamu member ke-{member} 🎉';
      text = template
        .replace(/@?\{user\}/gi, '@' + name)
        .replace(/@?\{group\}/gi, groupName)
        .replace(/\{namagrup\}/gi, groupName)
        .replace(/\{member\}/gi, String(nomor));
    } else {
      text = `👋 @${name} telah meninggalkan grup ${groupName}.`;
    }
    const payload = { text, mentions: [p] };

    try {
      const avatar = await fetchAvatar(sock, p);
      const card = await makeCard({ type: action === 'add' ? 'welcome' : 'goodbye', name: shown, groupName, memberNo: nomor, avatar });
      await sock.sendMessage(jid, { image: card, caption: text, mentions: payload.mentions });
    } catch (e) {
      console.error('[welcome] kartu gagal, kirim teks biasa:', e.message);
      await sock.sendMessage(jid, payload);
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
  cmdGoodbye,
  cmdGroupOpenClose,
  handleGroupParticipantsUpdate,
  checkAntilink,
  isSenderAdmin,
};
  
