const axios = require('axios');

const BASE = 'https://data.bmkg.go.id/DataMKG/TEWS';

// .cekgempa            -> daftar gempa M 5.0+ terbaru (BMKG)
// .cekgempa terbaru    -> gempa paling baru + peta guncangan (shakemap)
async function cmdCekGempa(sock, msg, jid, argText) {
  const mode = (argText || '').trim().toLowerCase();
  if (mode === 'terbaru' || mode === 'baru') {
    const { data } = await axios.get(`${BASE}/autogempa.json`, { timeout: 20000 });
    const g = data?.Infogempa?.gempa;
    if (!g) throw new Error('Data gempa belum tersedia dari BMKG.');
    const caption =
      `🌋 *GEMPA TERBARU*\nSumber: BMKG\n\nMagnitudo: ${g.Magnitude}\nTanggal: ${g.Tanggal}\nJam: ${g.Jam}\nWilayah: ${g.Wilayah}\nKedalaman: ${g.Kedalaman}\nLintang: ${g.Lintang}\nBujur: ${g.Bujur}\nPotensi: ${g.Potensi}` +
      (g.Dirasakan ? `\nDirasakan: ${g.Dirasakan}` : '');
    if (g.Shakemap) {
      try {
        const img = await axios.get(`https://static.bmkg.go.id/${g.Shakemap}`, { responseType: 'arraybuffer', timeout: 25000 });
        return sock.sendMessage(jid, { image: Buffer.from(img.data), caption }, { quoted: msg });
      } catch (e) { /* kirim teks saja */ }
    }
    return sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }

  const { data } = await axios.get(`${BASE}/gempaterkini.json`, { timeout: 20000 });
  const list = data?.Infogempa?.gempa;
  if (!Array.isArray(list) || !list.length) throw new Error('Data gempa belum tersedia dari BMKG.');
  let t = `GEMPA TERKINI M 5.0+\nTotal: ${list.length} gempa\nSumber: BMKG\n`;
  list.forEach((g, i) => {
    t += `\n${i + 1}. Gempa M ${g.Magnitude}\nTanggal: ${g.Tanggal}\nJam: ${g.Jam}\nWilayah: ${g.Wilayah}\nKedalaman: ${g.Kedalaman}\nLintang: ${g.Lintang}\nBujur: ${g.Bujur}\nPotensi: ${g.Potensi}\n`;
  });
  t += '\nKetik *.cekgempa terbaru* untuk gempa paling baru + peta guncangan.';
  return sock.sendMessage(jid, { text: t }, { quoted: msg });
}

module.exports = { cmdCekGempa };
                                        
