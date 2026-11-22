const BOT_NAME = process.env.BOT_NAME || 'MyBot';

function mainMenu(pushName) {
  const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return `╭━━━━━━━━━━━━━━━━━━╮
┃   🤖 *${BOT_NAME}*
╰━━━━━━━━━━━━━━━━━━╯
┃ 👤 User   : ${pushName}
┃ ⚡ Status : Online
┃ 🕐 Waktu  : ${waktu} WIB
╰──────────────────

╭─「 ✦ *MENU UTAMA* ✦ 」
│ 🎨 .menusticker
│ 📥 .menudownload
│ 🛠️ .menutools
│ 🤖 .menuai
│ 🎮 .menugame
│ 👥 .menugroup
╰──────────────────
_Ketik salah satu perintah di atas_`;
}

function stickerMenu() {
  return `╭─「 🎨 *MENU STICKER* 」
│ ✦ .s / .sticker
│    ↳ gambar/video → stiker
│ ✦ .toimg
│    ↳ stiker → gambar
│ ✦ .brat <teks>
│    ↳ stiker gaya Brat
│ ✦ .bratvid <teks>
│    ↳ Brat animasi (kata per kata)
│ ✦ .bratvid2 <teks>
│    ↳ Brat animasi versi 2
│ ✦ .iqc <teks | jam | baterai | jaringan | provider>
│    ↳ kartu quote chat
│ ✦ .smeme atas|bawah
│    ↳ meme di foto (1 atau 2 teks)
│ ✦ .nokia teks|pengirim|judul
│    ↳ SMS layar Nokia jadul
╰──────────────────`;
}

function downloadMenu() {
  return `╭─「 📥 *MENU DOWNLOADER* 」
│ ✦ .tiktok / .tt <link>
│ ✦ .ig <link>
│ ✦ .fb <link>
│ ✦ .yt / .ytmp4 <link>
│ ✦ .ytmp3 <link>
│ ✦ .play <judul lagu>
│ ✦ .pinterest <link>
│ ✦ .twitter / .x <link>
╰──────────────────
_Pakai link yang publik ya_`;
}

function toolsMenu() {
  return `╭─「 🛠️ *MENU TOOLS* 」
│ ✦ .translate <kode> <teks>
│ ✦ .tts <teks>
│ ✦ .ss <url>
│ ✦ .shortlink <url>
│ ✦ .cuaca <kota>
│ ✦ .qrcode <teks/link>
│ ✦ .kurs 100 usd idr
│ ✦ .fakta
│
│ ✨ *Foto & Video*
│ ✦ .wink hd | 2k | 4k
│    ↳ perbesar & pertajam
│ ✦ .remini
│    ↳ HD-in foto buram 2x
│
│ 🎲 *Hiburan*
│ ✦ .ttstalk <username>
│ ✦ .rndmanime
│ ✦ .rndmmeme
╰──────────────────`;
}

function aiMenu() {
  return `╭─「 🤖 *MENU AI* 」
│ ✦ .ai <pertanyaan>
│    ↳ tanya pelajaran, PR, apa aja
│ ✦ .ai <curhatan>
│    ↳ ngobrol santai kayak teman
│ ✦ .ai reset
│    ↳ mulai obrolan baru dari nol
│ ✦ .chatai on / off
│    ↳ on = AI jawab semua chat di sini
│    ↳ off = AI berhenti
╰──────────────────
_Contoh: .ai jelasin fotosintesis pake bahasa gaul_`;
}

function gameMenu() {
  return `╭─「 🎮 *MENU GAME* 」
│ ✦ .uno join
│    ↳ buka/ikut lobi UNO
│ ✦ .uno start
│    ↳ mulai (host, min. 2 pemain)
│ ✦ .uno help
│    ↳ cara main lengkap
╰──────────────────
_Lebih banyak game nyusul 👀_`;
}

function groupMenu() {
  return `╭─「 👥 *MENU GROUP* 」
│ _khusus admin grup_
│ ✦ .kick @user
│ ✦ .add 628xxx
│ ✦ .promote @user
│ ✦ .demote @user
│ ✦ .hidetag <teks>
│ ✦ .antilink on/off
│ ✦ .antitagsw on/off
│ ✦ .welcome on/off
│ ✦ .setwelcome <teks>
│ ✦ .setdeskripsi <teks>
│ ✦ .swgc
│    ↳ foto/video → Status WA
│ ✦ .groupopen / .groupclose
╰──────────────────`;
}

module.exports = { mainMenu, stickerMenu, downloadMenu, toolsMenu, aiMenu, gameMenu, groupMenu };
