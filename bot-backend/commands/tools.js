const axios = require('axios');

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

async function cmdShortlink(sock, msg, jid, text) {
  if (!text) return sock.sendMessage(jid, { text: 'Contoh: *.shortlink https://link-panjang.com*' }, { quoted: msg });
  try {
    const { data } = await axios.get('https://is.gd/create.php', {
      params: { format: 'simple', url: text.trim() },
    });
    await sock.sendMessage(jid, { text: `🔗 ${data}` }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: '❌ Gagal bikin shortlink: ' + err.message }, { quoted: msg });
  }
}

module.exports = { cmdTranslate, cmdTts, cmdScreenshot, cmdShortlink };
