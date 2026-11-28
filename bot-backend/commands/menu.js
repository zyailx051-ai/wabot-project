const BOT_NAME = process.env.BOT_NAME || 'MyBot';
const PREFIX = process.env.BOT_PREFIX || '.';

const wib = () => {
  const d = new Date();
  return {
    jam: d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace('.', ':'),
    tanggal: d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
};

const CATS = [
  { key: 'sticker', label: '🎨 Sticker', cmd: 'menusticker' },
  { key: 'download', label: '📥 Downloader', cmd: 'menudownload' },
  { key: 'tools', label: '🛠️ Tools & Foto', cmd: 'menutools' },
  { key: 'ai', label: '🤖 AI', cmd: 'menuai' },
  { key: 'game', label: '🎮 Game', cmd: 'menugame' },
  { key: 'group', label: '👥 Grup', cmd: 'menugroup' },
];

const FOOT = `\n\n_↩ ketik *${PREFIX}menu* untuk kembali_`;

function mainMenu(pushName) {
  const { jam, tanggal } = wib();
  return `╭───〔 🤖 *${BOT_NAME}* 〕
│
│  Halo, *${pushName}* 👋
│
│  🕐 ${jam} WIB
│  📅 ${tanggal}
│  🔰 Prefix  ${PREFIX}
│  🟢 Status  Online
╰──────────────

📖 *Cara pakai*
1. Pilih kategori lewat polling di bawah
2. atau balas pesan ini dengan angka *1-${CATS.length}*
3. atau ketik langsung, mis. *${PREFIX}menusticker*

${CATS.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`;
}

function stickerMenu() {
  return `╭──〔 🎨 *STICKER* 〕
│ ${PREFIX}s · ${PREFIX}sticker
│   gambar/video → stiker
│ ${PREFIX}toimg
│   stiker → gambar
│ ${PREFIX}brat <teks>
│ ${PREFIX}bratvid <teks>
│ ${PREFIX}bratvid2 <teks>
│   stiker Brat (diam / animasi)
│ ${PREFIX}smeme atas|bawah
│   meme di atas foto
│ ${PREFIX}saudio
│   video ≤10 dtk → stiker bersuara
│ ${PREFIX}stickertiktok <link>
│   stiker dari komentar TikTok
╰──────────────

╭──〔 🖼️ *GAMBAR & MEME* 〕
│ ${PREFIX}iqc <teks>
│   tangkapan chat iPhone
│ ${PREFIX}meledak
│   foto + latar mobil meledak
│ ${PREFIX}quote <teks | warna>
│ ${PREFIX}qcwa <teks>
│ ${PREFIX}jarvismeme <teks>
│ ${PREFIX}nokia teks|pengirim|judul
╰──────────────${FOOT}`;
}

function downloadMenu() {
  return `╭──〔 📥 *DOWNLOADER* 〕
│ ${PREFIX}aio <link>
│   otomatis kenali link apa pun
│
│ ${PREFIX}tiktok · ${PREFIX}tt <link>
│ ${PREFIX}ig <link>
│ ${PREFIX}fb <link>
│ ${PREFIX}yt · ${PREFIX}ytmp4 <link>
│ ${PREFIX}ytmp3 <link>
│ ${PREFIX}play <judul lagu>
│ ${PREFIX}pinterest <link>
│ ${PREFIX}twitter · ${PREFIX}x <link>
╰──────────────
_Pakai link yang publik ya_${FOOT}`;
}

function toolsMenu() {
  return `╭──〔 🛠️ *TOOLS* 〕
│ ${PREFIX}translate <kode> <teks>
│ ${PREFIX}tts <teks>
│ ${PREFIX}ss <url>
│ ${PREFIX}shortlink <url>
│ ${PREFIX}cuaca <kota>
│ ${PREFIX}qrcode <teks/link>
│ ${PREFIX}kurs 100 usd idr
│ ${PREFIX}cekgempa
│ ${PREFIX}fakta
╰──────────────

╭──〔 ✨ *FOTO* 〕
│ ${PREFIX}wink · ${PREFIX}remini
│   HD-in foto buram
│ ${PREFIX}removebg
│   hapus background
╰──────────────

╭──〔 🎲 *HIBURAN* 〕
│ ${PREFIX}ttstalk <username>
│ ${PREFIX}rndmanime
│ ${PREFIX}rndmmeme
╰──────────────${FOOT}`;
}

function aiMenu() {
  return `╭──〔 🤖 *AI* 〕
│ ${PREFIX}chatai on / off
│   AI jawab semua chat di sini
╰──────────────

╭──〔 🎨 *FOTO JADI…* 〕
│ ${PREFIX}toanime
│ ${PREFIX}tokartun
│ ${PREFIX}to3d
│ ${PREFIX}tosketsa
│ ${PREFIX}tohitamputih
│ ${PREFIX}foto jadi <gaya>
╰──────────────
_kirim / reply foto_${FOOT}`;
}

function gameMenu() {
  return `╭──〔 🎮 *GAME* 〕
│ 🃏 ${PREFIX}uno join / start / help
│
│ 🧠 ${PREFIX}kuis horror · anime · bola
│    ${PREFIX}kuis top · ${PREFIX}kuis stop
│
│ 🔤 ${PREFIX}sambung kata
│    ${PREFIX}sambung help · stop
╰──────────────${FOOT}`;
}

function groupMenu() {
  return `╭──〔 👥 *GRUP* 〕
│ _khusus admin grup_
│ ${PREFIX}kick · ${PREFIX}add · ${PREFIX}promote · ${PREFIX}demote
│ ${PREFIX}hidetag <teks>
│ ${PREFIX}antilink on/off
│ ${PREFIX}antitagsw on/off
│ ${PREFIX}antikudeta on/off
│ ${PREFIX}welcome · ${PREFIX}goodbye on/off
│ ${PREFIX}setwelcome · ${PREFIX}setdeskripsi
│ ${PREFIX}swgc
│   foto/video → Status Grup
│ ${PREFIX}groupopen · ${PREFIX}groupclose
╰──────────────${FOOT}`;
}

const BODY = { sticker: stickerMenu, download: downloadMenu, tools: toolsMenu, ai: aiMenu, game: gameMenu, group: groupMenu };

// ---- menu interaktif: polling (tap untuk pilih) + balas angka ----
const menuMsgs = new Map(); // id pesan menu -> true
const seenVotes = new Set();
const remember = (id) => { if (!id) return; menuMsgs.set(id, true); if (menuMsgs.size > 200) menuMsgs.delete(menuMsgs.keys().next().value); };

async function sendCategory(sock, jid, idx, quoted) {
  const cat = CATS[idx];
  if (!cat) return false;
  await sock.sendMessage(jid, { text: BODY[cat.key]() }, quoted ? { quoted } : {});
  return true;
}

async function sendMainMenu(sock, msg, jid, pushName) {
  const sent = await sock.sendMessage(jid, { text: mainMenu(pushName) }, { quoted: msg });
  remember(sent?.key?.id);
  try {
    const poll = await sock.sendMessage(jid, { poll: { name: '👇 Pilih menu', values: CATS.map((c) => c.label), selectableCount: 1 } });
    remember(poll?.key?.id);
  } catch (e) {
    console.error('[menu] polling gagal dikirim:', e.message);
  }
}

// balasan angka pada pesan menu
async function handleReply(sock, msg, jid, text) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.stanzaId || !menuMsgs.has(ctx.stanzaId)) return false;
  const n = parseInt(String(text).trim(), 10);
  if (!(n >= 1 && n <= CATS.length)) return false;
  return sendCategory(sock, jid, n - 1, msg);
}

// suara baru pada polling menu (dipanggil dari messages.update)
async function handlePollVotes(sock, key, pollMsg, pollUpdates, getAggregate) {
  const votes = getAggregate({ message: pollMsg, pollUpdates });
  for (const v of votes) {
    for (const voter of v.voters || []) {
      const k = `${key.id}|${voter}|${v.name}`;
      if (seenVotes.has(k)) continue;
      seenVotes.add(k);
      if (seenVotes.size > 2000) seenVotes.delete(seenVotes.values().next().value);
      const idx = CATS.findIndex((c) => c.label === v.name);
      if (idx >= 0) await sendCategory(sock, key.remoteJid, idx);
    }
  }
}

module.exports = { mainMenu, stickerMenu, downloadMenu, toolsMenu, aiMenu, gameMenu, groupMenu, sendMainMenu, handleReply, handlePollVotes, remember };
                                            
