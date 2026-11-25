const { getGroupSettings, setGroupSetting } = require('../lib/store');
const lidmap = require('../lib/lidmap');

const WINDOW_MS = 60 * 1000; // jendela waktu pantau
const MASS_LIMIT = 3; // 3 anggota dikeluarkan oleh satu admin dalam 1 menit = mencurigakan
const removals = new Map(); // `${grup}|${pelaku}` -> [waktu, ...]

const idOf = (p) => (typeof p === 'string' ? p : p?.phoneNumber || p?.id || '');
const idsOf = (j) => {
  const n = lidmap.norm(j);
  const pn = lidmap.isLid(n) ? lidmap.toPN(n) : null;
  return [n, pn].filter(Boolean);
};
const same = (a, b) => !!a && !!b && idsOf(a).some((x) => idsOf(b).includes(x));
const inList = (list, j) => list.some((x) => same(x, j));
const num = (j) => '@' + String(j).split('@')[0];

function botIds(sock) {
  return [sock.user?.id, sock.user?.lid].filter(Boolean);
}
function botIsAdmin(sock, meta) {
  return meta.participants.some((p) => p.admin && inList(botIds(sock), p.id));
}

async function safeUpdate(sock, jid, ids, action) {
  try {
    await sock.groupParticipantsUpdate(jid, ids, action);
    return true;
  } catch (e) {
    console.error(`[antikudeta] gagal ${action}:`, e.message);
    return false;
  }
}

// Dipanggil dari handleGroupParticipantsUpdate untuk aksi remove / promote / demote
async function handleEvent(sock, event) {
  const { id: jid, author, participants, action } = event;
  if (!author || !['remove', 'promote', 'demote'].includes(action)) return;
  const settings = getGroupSettings(jid);
  if (!settings.antikudeta) return;
  if (inList(botIds(sock), author)) return; // aksi dari bot sendiri (hindari perulangan)

  let meta;
  try { meta = await sock.groupMetadata(jid); } catch (e) { return; }
  const trusted = [meta.owner, meta.ownerPn, ...(settings.antikudetaWL || [])].filter(Boolean);
  if (inList(trusted, author)) return;
  if (!botIsAdmin(sock, meta)) {
    console.error('[antikudeta] bot bukan admin di', jid, '- nggak bisa bertindak');
    return;
  }
  const targets = (participants || []).map(idOf).filter(Boolean);

  if (action === 'remove') {
    const key = `${jid}|${lidmap.norm(author)}`;
    const now = Date.now();
    const arr = (removals.get(key) || []).filter((t) => now - t < WINDOW_MS);
    for (let i = 0; i < targets.length; i++) arr.push(now);
    removals.set(key, arr);
    if (arr.length >= MASS_LIMIT) {
      removals.delete(key);
      await safeUpdate(sock, jid, [author], 'demote');
      await safeUpdate(sock, jid, targets, 'add');
      await sock.sendMessage(jid, { text: `🚨 *ANTI KUDETA*\n${num(author)} mengeluarkan banyak anggota sekaligus.\nJabatan admin-nya dicabut dan anggota yang dikeluarkan dicoba ditambahkan lagi.`, mentions: [author] });
    }
    return;
  }

  if (action === 'promote') {
    const toRevert = targets.filter((t) => !inList(trusted, t));
    if (!toRevert.length) return;
    await safeUpdate(sock, jid, toRevert, 'demote');
    await sock.sendMessage(jid, { text: `🛡️ *ANTI KUDETA*\n${num(author)} mencoba menjadikan ${toRevert.map(num).join(', ')} admin.\nDibatalkan. Hanya pemilik grup / admin whitelist yang boleh mengatur admin.`, mentions: [author, ...toRevert] });
    return;
  }

  if (action === 'demote') {
    await safeUpdate(sock, jid, targets, 'promote');
    await safeUpdate(sock, jid, [author], 'demote');
    await sock.sendMessage(jid, { text: `🚨 *ANTI KUDETA*\n${num(author)} mencopot admin ${targets.map(num).join(', ')}.\nAdmin dikembalikan dan jabatan ${num(author)} dicabut.`, mentions: [author, ...targets] });
  }
}

function mentionedIn(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const list = [...(ctx?.mentionedJid || [])];
  if (ctx?.participant && ctx?.quotedMessage) list.push(ctx.participant);
  return list;
}

// .antikudeta on|off|status|wl add|wl del|wl list
async function cmdAntiKudeta(sock, msg, jid, senderJid, text) {
  if (!jid.endsWith('@g.us')) return sock.sendMessage(jid, { text: 'Fitur ini cuma untuk di dalam grup.' }, { quoted: msg });
  const { isSenderAdmin } = require('./group');
  const ok = msg.key.fromMe || (await isSenderAdmin(sock, jid, senderJid).catch(() => false));
  if (!ok) return sock.sendMessage(jid, { text: '❌ Cuma admin grup yang boleh mengatur Anti Kudeta.' }, { quoted: msg });

  const parts = (text || '').trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || '').toLowerCase();
  const settings = getGroupSettings(jid);

  if (sub === 'on' || sub === 'off') {
    if (sub === 'on') {
      let warn = '';
      try {
        const meta = await sock.groupMetadata(jid);
        if (!botIsAdmin(sock, meta)) warn = '\n\n⚠️ Bot belum jadi *admin* grup ini. Jadikan bot admin supaya perlindungan bisa bekerja.';
      } catch (e) { /* abaikan */ }
      setGroupSetting(jid, 'antikudeta', true);
      return sock.sendMessage(jid, { text: `🛡️ *Anti Kudeta AKTIF*\n• Pengeluaran massal (≥${MASS_LIMIT} anggota/menit) → admin pelaku dicopot\n• Admin yang mencopot admin lain → dikembalikan & pelaku dicopot\n• Admin baru yang diangkat bukan oleh pemilik/whitelist → dibatalkan\n\nTambah admin tepercaya: *.antikudeta wl add @user*${warn}` }, { quoted: msg });
    }
    setGroupSetting(jid, 'antikudeta', false);
    return sock.sendMessage(jid, { text: '🛑 Anti Kudeta dimatikan.' }, { quoted: msg });
  }

  if (sub === 'wl' || sub === 'whitelist') {
    const act = (parts[1] || '').toLowerCase();
    const list = [...(settings.antikudetaWL || [])];
    if (act === 'list' || !act) {
      return sock.sendMessage(jid, { text: list.length ? `✅ *Whitelist Anti Kudeta*\n${list.map((j, i) => `${i + 1}. ${num(j)}`).join('\n')}` : 'Whitelist masih kosong.\nPemilik grup selalu dianggap tepercaya.', mentions: list }, { quoted: msg });
    }
    const targets = mentionedIn(msg);
    if (!targets.length) return sock.sendMessage(jid, { text: 'Tag orangnya atau reply pesannya.\nContoh: *.antikudeta wl add @user*' }, { quoted: msg });
    if (act === 'add') {
      for (const t of targets) if (!inList(list, t)) list.push(lidmap.norm(t));
      setGroupSetting(jid, 'antikudetaWL', list);
      return sock.sendMessage(jid, { text: `✅ Ditambahkan ke whitelist: ${targets.map(num).join(', ')}`, mentions: targets }, { quoted: msg });
    }
    if (act === 'del' || act === 'hapus' || act === 'remove') {
      const next = list.filter((x) => !inList(targets, x));
      setGroupSetting(jid, 'antikudetaWL', next);
      return sock.sendMessage(jid, { text: `🗑️ Dihapus dari whitelist: ${targets.map(num).join(', ')}`, mentions: targets }, { quoted: msg });
    }
  }

  const st = settings.antikudeta ? 'AKTIF ✅' : 'MATI ❌';
  return sock.sendMessage(jid, { text: `🛡️ *ANTI KUDETA* — sekarang: *${st}*\n\n*.antikudeta on* — aktifkan\n*.antikudeta off* — nonaktifkan\n*.antikudeta wl add @user* — whitelist admin tepercaya\n*.antikudeta wl del @user* — hapus dari whitelist\n*.antikudeta wl list* — lihat whitelist\n\nBot harus jadi admin grup.` }, { quoted: msg });
}

module.exports = { cmdAntiKudeta, handleEvent, _test: { same, inList } };
