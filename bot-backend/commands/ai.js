const axios = require('axios');

// Google Gemini — daftar API key cukup pakai akun Google di aistudio.google.com/apikey, nggak ada reCAPTCHA.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Kamu adalah asisten AI di sebuah bot WhatsApp Indonesia. Kamu ramah, santai, dan ngobrol kayak teman deket—bukan kayak mesin pencari yang kaku.
- Kalau ditanya soal pelajaran (matematika, sains, sejarah, dll), jelasin kayak guru privat yang sabar: bahasa gaul/santai, analogi yang gampang dibayangin anak sekolah, boleh emoji secukupnya, tapi tetap akurat, jangan ngarang.
- Kalau orang curhat atau cuma pengen ngobrol, dengerin & tanggepin dengan empati kayak teman ngobrol, bukan kayak terapis formal atau robot.
- Jawab pakai Bahasa Indonesia gaul, panjangnya secukupnya (jangan kepanjangan kecuali diminta detail/dijelasin lebih lanjut).
- Kalau nggak yakin/nggak tau sesuatu, jujur aja bilang nggak tau, jangan ngarang jawaban.`;

const MAX_HISTORY = 10; // jumlah pesan (user+ai) terakhir yang diinget per orang
const history = new Map(); // senderJid -> [{role, content}]

function getHistory(key) {
  if (!history.has(key)) history.set(key, []);
  return history.get(key);
}

function trimHistory(hist) {
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
}

// .ai <pertanyaan/curhatan>  |  .ai reset
async function cmdAi(sock, msg, jid, senderJid, text) {
  const q = (text || '').trim();

  if (!process.env.GEMINI_API_KEY) {
    return sock.sendMessage(
      jid,
      { text: '⚠️ Fitur *.ai* belum aktif.\nAdmin bot perlu bikin API key gratis di aistudio.google.com/apikey (cukup login Google), terus taruh di Railway Variables dengan nama *GEMINI_API_KEY*.' },
      { quoted: msg }
    );
  }

  if (!q) {
    return sock.sendMessage(
      jid,
      {
        text:
          `🤖 *.ai* — tanya pelajaran atau ngobrol santai\n\n` +
          `Contoh:\n` +
          `*.ai jelasin fotosintesis pake bahasa gaul*\n` +
          `*.ai lagi capek banget hari ini*\n` +
          `*.ai bantuin PR matematika: 2x+5=15*\n\n` +
          `Ketik *.ai reset* kalau mau mulai obrolan baru (lupain konteks sebelumnya).`,
      },
      { quoted: msg }
    );
  }

  const key = senderJid;
  if (/^reset$/i.test(q)) {
    history.delete(key);
    return sock.sendMessage(jid, { text: '🔄 Oke, obrolan kita di-reset. Mulai dari awal lagi ya!' }, { quoted: msg });
  }

  const hist = getHistory(key);
  hist.push({ role: 'user', content: q });
  trimHistory(hist);

  try {
    const { data } = await axios.post(
      GEMINI_URL,
      {
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...hist],
        temperature: 0.8,
        max_tokens: 700,
      },
      {
        headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    const reply = data?.choices?.[0]?.message?.content?.trim() || 'Hmm aku bingung jawabnya, coba tanya ulang deh.';
    hist.push({ role: 'assistant', content: reply });
    trimHistory(hist);
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  } catch (e) {
    hist.pop(); // buang pertanyaan yang gagal dijawab biar history nggak nyangkut
    const status = e.response?.status;
    if (status === 401 || status === 403) {
      return sock.sendMessage(jid, { text: '⚠️ GEMINI_API_KEY salah/nggak valid. Cek lagi nilainya di Railway Variables.' }, { quoted: msg });
    }
    if (status === 429) {
      return sock.sendMessage(jid, { text: '⏳ Lagi banyak yang pakai AI nih (limit gratis harian kesentuh), coba lagi besok atau beberapa saat ya.' }, { quoted: msg });
    }
    console.error('[ai] error:', e.response?.data || e.message);
    return sock.sendMessage(jid, { text: '❌ AI-nya lagi gangguan, coba lagi ya.' }, { quoted: msg });
  }
}

module.exports = { cmdAi };
