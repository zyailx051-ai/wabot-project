const sharp = require('sharp');
const path = require('path');
const { downloadQuotedOrDirectMedia } = require('../lib/helpers');

const BG = path.join(__dirname, '..', 'assets', 'meledak_bg.jpg'); // latar mobil meledak (ganti file ini kalau mau latar lain)

// Hapus background foto lewat API (kalau gagal -> null, nanti pakai efek pudar di tepi)
async function cutout(buf) {
  try {
    const out = await require('./aiimage').viaNexa('removebg', buf);
    const meta = await sharp(out).metadata();
    return meta.hasAlpha ? out : null;
  } catch (e) {
    console.error('[meledak] hapus background gagal:', e.message);
    return null;
  }
}

// .meledak — kirim foto + caption .meledak (atau reply foto)
async function cmdMeledak(sock, msg, jid) {
  const media = await downloadQuotedOrDirectMedia(msg);
  if (!media || media.type !== 'imageMessage') {
    return sock.sendMessage(jid, { text: '💥 Kirim *foto* dengan caption *.meledak* (atau reply foto lalu ketik *.meledak*).\nLatar fotonya jadi mobil meledak.' }, { quoted: msg });
  }
  const base = await sharp(media.buffer).rotate().resize({ width: 1024, height: 1280, fit: 'inside', withoutEnlargement: false }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
  const { width: w, height: h } = await sharp(base).metadata();

  const bg = await sharp(BG).resize(w, h, { fit: 'cover', position: 'centre' }).toBuffer();

  let fg;
  let usedCutout = false;
  const cut = await cutout(base);
  if (cut) {
    fg = await sharp(cut).resize(w, h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    usedCutout = true;
  } else {
    // tanpa cutout: foto dipudarkan ke tepi supaya menyatu dengan latar ledakan
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="50%" r="64%"><stop offset="52%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    const mask = await sharp(Buffer.from(svg)).resize(w, h).greyscale().raw().toBuffer();
    fg = await sharp(base).removeAlpha().joinChannel(mask, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  }
  const out = await sharp(bg).composite([{ input: fg }]).jpeg({ quality: 92 }).toBuffer();
  await sock.sendMessage(jid, { image: out, caption: usedCutout ? '💥 Meledak!' : '💥 Meledak! (background tidak terhapus penuh, API hapus background lagi gagal)' }, { quoted: msg });
}

module.exports = { cmdMeledak };
      
