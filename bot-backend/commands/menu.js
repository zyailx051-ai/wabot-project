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
│ 👥 .menugroup
│ 🤖 .menuai
│ 🎮 .menugame
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
│ ✦ .iqc / .iqc <teks>
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
│ 🎲 *Hiburan*
│ ✦ .ttstalk <username>
│ ✦ .rndmanime
│    ↳ wallpaper HP | pc | file | <tema>
│ ✦ .rndmmeme
│    ↳ meme Indonesia acak
╰──────────────────`;
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
│    ↳ tambah --warn: 3x melanggar = kick
│ ✦ .welcome on/off
│ ✦ .setwelcome <teks>
│ ✦ .setdeskripsi <teks>
│ ✦ .swgc
│    ↳ foto/video → Status WA
│ ✦ .groupopen / .groupclose
╰──────────────────`;
}

function aiMenu() {
  return `╭─「 🤖 *MENU AI* 」
│ ✨ *Foto & Video*
│ ✦ .wink hd | 2k | 4k
│    ↳ perbesar & pertajam
│ ✦ .remini
│    ↳ HD-in foto buram 2x
╰──────────────────
_Balas atau kirim foto dengan perintahnya_`;
}

function gameMenu() {
  return `╭─「 🎮 *MENU GAME* 」
│ 🃏 .uno
╰──────────────────
_Ketik perintahnya untuk lihat cara main_`;
}

module.exports = { mainMenu, stickerMenu, downloadMenu, toolsMenu, groupMenu, aiMenu, gameMenu };
