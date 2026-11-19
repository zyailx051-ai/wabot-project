const axios = require('axios');
const QRCode = require('qrcode');

async function cmdTranslate(sock, msg, jid, text) {
  const match = text.match(/^(\w{2})\s+([\s\S]+)/);
  if (!match) {
    return sock.sendMessage(jid, { text: 'Contoh: *.translate en halo semua* (kode bahasa 2 huruf lalu teksnya)' }, { quoted: msg });
  }
  const [, lang, content] = match;
  try {
    const { data } = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: content },
    });
    const result = data[0].map((d) => d[0]).join('');
    await sock.sendMessage(jid, { text: `🌐 *Translate (${lang})*:\n${result}` }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal translate: ' + err.message }, { quoted: msg });
  }
}

async function cmdTts(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.tts halo apa kabar*' }, { quoted: msg });
  try {
    const chunk = text.slice(0, 200);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=id&client=tw-ob`;
    const { data } = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    await sock.sendMessage(jid, { audio: Buffer.from(data), mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal TTS: ' + err.message }, { quoted: msg });
  }
}

async function cmdScreenshot(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.ss https://google.com*' }, { quoted: msg });
  let url = text.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const shotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1024`;
  await sock.sendMessage(jid, { image: { url: shotUrl }, caption: `📸 Screenshot: ${url}` }, { quoted: msg });
}

// Shortlink dengan 2 lapis: is.gd dulu, kalau hasilnya nggak valid (error / bukan link),
// otomatis coba tinyurl sebagai cadangan. Dua-duanya gratis, tanpa API key.
function looksLikeShortUrl(s) {
  return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim()) && !/error/i.test(s);
}

async function tryIsGd(url) {
  const { data } = await axios.get('https://is.gd/create.php', {
    params: { format: 'simple', url },
    timeout: 15000,
  });
  const result = String(data).trim();
  if (!looksLikeShortUrl(result)) throw new Error(result || 'is.gd menolak link ini');
  return result;
}

async function tryTinyUrl(url) {
  const { data } = await axios.get('https://tinyurl.com/api-create.php', {
    params: { url },
    timeout: 15000,
  });
  const result = String(data).trim();
  if (!looksLikeShortUrl(result)) throw new Error(result || 'tinyurl menolak link ini');
  return result;
}

async function cmdShortlink(sock, msg, jid, text) {
  const url = (text || '').trim();
  if (!url) return sock.sendMessage(jid, { text: 'Contoh: *.shortlink https://link-panjang.com*' }, { quoted: msg });
  if (!/^https?:\/\//i.test(url)) {
    return sock.sendMessage(jid, { text: '⚠️ Link harus diawali http:// atau https://' }, { quoted: msg });
  }

  let short, via;
  try {
    short = await tryIsGd(url);
    via = 'is.gd';
  } catch (e1) {
    try {
      short = await tryTinyUrl(url);
      via = 'tinyurl';
    } catch (e2) {
      return sock.sendMessage(
        jid,
        { text: `❌ Gagal bikin shortlink (sudah coba 2 layanan). Pesan error: ${e2.message}` },
        { quoted: msg }
      );
    }
  }

  await sock.sendMessage(jid, { text: `🔗 ${short}\n_(via ${via})_` }, { quoted: msg });
}

// Cuaca: pakai wttr.in, gratis tanpa API key, cukup kirim nama kota
async function cmdWeather(sock, msg, jid, text) {
  const city = (text || '').trim();
  if (!city) return sock.sendMessage(jid, { text: 'Contoh: *.cuaca Jakarta*' }, { quoted: msg });
  try {
    const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(city)}`, {
      params: { format: 'j1' },
      timeout: 15000,
      headers: { 'User-Agent': 'curl' },
    });
    const cur = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!cur) throw new Error('Data cuaca tidak ditemukan');
    const namaKota = area ? `${area.areaName?.[0]?.value || city}, ${area.country?.[0]?.value || ''}` : city;
    const teks =
      `🌦️ *Cuaca ${namaKota}*\n` +
      `Kondisi: ${cur.lang_id?.[0]?.value || cur.weatherDesc?.[0]?.value}\n` +
      `Suhu: ${cur.temp_C}°C (terasa ${cur.FeelsLikeC}°C)\n` +
      `Kelembapan: ${cur.humidity}%\n` +
      `Angin: ${cur.windspeedKmph} km/jam\n` +
      `Curah hujan: ${cur.precipMM} mm`;
    await sock.sendMessage(jid, { text: teks }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal ambil data cuaca: ' + err.message }, { quoted: msg });
  }
}

// QR Code: generate dari teks, pakai library qrcode (sudah ada di dependencies)
async function cmdQrcode(sock, msg, jid, text) {
  const content = (text || '').trim();
  if (!content) return sock.sendMessage(jid, { text: 'Contoh: *.qrcode https://wa.me/628123456789* atau teks apa saja' }, { quoted: msg });
  try {
    const buffer = await QRCode.toBuffer(content, { width: 512, margin: 2 });
    await sock.sendMessage(jid, { image: buffer, caption: `📱 QR Code untuk:\n${content}` }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal bikin QR code: ' + err.message }, { quoted: msg });
  }
}

// Kurs mata uang: pakai frankfurter.app, gratis tanpa API key (mata uang fiat utama)
async function cmdKurs(sock, msg, jid, text) {
  const m = (text || '').trim().match(/^([\d.,]+)\s+([a-zA-Z]{3})\s+([a-zA-Z]{3})$/);
  if (!m) return sock.sendMessage(jid, { text: 'Contoh: *.kurs 100 usd idr*' }, { quoted: msg });
  const amount = parseFloat(m[1].replace(/,/g, ''));
  const from = m[2].toUpperCase();
  const to = m[3].toUpperCase();
  try {
    const { data } = await axios.get('https://api.frankfurter.app/latest', {
      params: { amount, from, to },
      timeout: 15000,
    });
    const hasil = data.rates?.[to];
    if (hasil === undefined) throw new Error('Kode mata uang tidak dikenali');
    await sock.sendMessage(
      jid,
      { text: `💱 ${amount.toLocaleString('id-ID')} ${from} = *${hasil.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${to}*` },
      { quoted: msg }
    );
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal konversi (cek kode mata uang, contoh usd/idr/eur/jpy): ' + err.message }, { quoted: msg });
  }
}

// Fakta acak: ambil bahasa Inggris dari uselessfacts, lalu translate ke Indonesia
async function cmdFakta(sock, msg, jid) {
  try {
    const { data } = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random', {
      params: { language: 'en' },
      timeout: 15000,
    });
    const fact = data.text;
    const { data: tr } = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'en', tl: 'id', dt: 't', q: fact },
    });
    const idText = tr[0].map((d) => d[0]).join('');
    await sock.sendMessage(jid, { text: `🧠 *Tahukah kamu?*\n${idText}` }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal ambil fakta: ' + err.message }, { quoted: msg });
  }
}

module.exports = { cmdTranslate, cmdTts, cmdScreenshot, cmdShortlink, cmdWeather, cmdQrcode, cmdKurs, cmdFakta };
      
