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
│ ✦ .iqc <teks | jam | baterai | jaringan>
│    ↳ chat iPhone palsu, bisa diatur
│ ✦ .meledak <teks>
│    ↳ kirim foto + caption .meledak
│ ✦ .quote <teks | warna>
│    ↳ kutipan teks serif aesthetic
│ ✦ .qcwa <teks>
│    ↳ kutipan chat WhatsApp
│ ✦ .jarvismeme <teks>
│    ↳ meme banner + gaya JARVIS
│ ✦ .saudio
│    ↳ video (maks 10 dtk) jadi stiker + suara
│ ✦ .stickertiktok <link>
│    ↳ media TikTok jadi stiker
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
│ ✦ .cekgempa
│    ↳ info gempa M 5.0+ terbaru (BMKG)
│
│ ✨ *Foto & Video*
│ ✦ .wink
│    ↳ HD-in foto pakai AI (video: .wink hd|2k|4k)
│ ✦ .remini
│    ↳ HD-in foto buram (AI Wink)
│ ✦ .removebg / .hapus bg
│    ↳ hapus background foto
│
│ 🎲 *Hiburan*
│ ✦ .ttstalk <username>
│ ✦ .rndmanime
│ ✦ .rndmmeme
╰──────────────────`;
}

function aiMenu() {
  return `╭─「 🤖 *MENU AI* 」
│ ✦ .chatai on / off
│    ↳ on = AI jawab semua chat di sini
│    ↳ off = AI berhenti
│    ↳ reaksi ⏳ mikir • 🤖 dijawab • ❌ gagal
│
│ 🎨 *Foto jadi...*
│ ✦ .toanime — jadi anime
│ ✦ .tokartun — jadi kartun
│ ✦ .to3d — jadi 3D Pixar
│ ✦ .tosketsa — sketsa pensil
│ ✦ .tohitamputih — hitam putih
│ ✦ .foto jadi <gaya>
│    ↳ kirim / reply foto
╰──────────────────`;
}

function gameMenu() {
  return `╭─「 🎮 *MENU GAME* 」
│ 🃏 *UNO*
│ ✦ .uno join / start / help
│
│ 🧠 *Kuis* (10 soal, 15 detik)
│ ✦ .kuis horror
│ ✦ .kuis anime
│ ✦ .kuis bola
│ ✦ .kuis top — leaderboard mingguan
│ ✦ .kuis stop
│
│ 🔤 *Sambung Kata*
│ ✦ .sambung kata  (atau .tebak kata)
│ ✦ .sambung help — aturan
│ ✦ .sambung stop
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
│ ✦ .welcome on/off (kartu + foto profil)
│ ✦ .goodbye on/off (kartu perpisahan)
│ ✦ .antikudeta on/off
│    ↳ lindungi grup dari admin nakal
│    ↳ .antikudeta wl add @user
│ ✦ .setwelcome <teks>
│ ✦ .setdeskripsi <teks>
│ ✦ .swgc
│    ↳ foto/video → Status WA
│ ✦ .groupopen / .groupclose
╰──────────────────`;
}

module.exports = { mainMenu, stickerMenu, downloadMenu, toolsMenu, aiMenu, gameMenu, groupMenu };
