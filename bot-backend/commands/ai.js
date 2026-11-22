const axios = require('axios');
const { getGroupSettings, setGroupSetting } = require('../lib/store');
const { react } = require('../lib/react');

// API AI (Nexa, gratis tanpa key): GET /ai/deepsek?text=...  ->  { status, result }
const AI_URL = process.env.NEXA_AI_URL || 'https://api.nexadev.my.id/ai/deepsek';

const PERSONA =
  'Kamu asisten AI di bot WhatsApp Indonesia. Ngobrol santai kayak teman deket, bahasa Indonesia gaul, ' +
  'jawab secukupnya (jangan kepanjangan kecuali diminta). Kalau ditanya pelajaran, jelasin kayak guru privat yang sabar ' +
  'pakai analogi gampang. Kalau orang curhat, tanggepin dengan empati. Kalau nggak tau, jujur bilang nggak tau.';

const MAX_TURNS = 6; // jumlah pesan terakhir yang diinget per orang
const history = new Map(); // `${jid}|${sender}` -> [{role:'user'|'ai', text}]
const chains = new Map(); // `${jid}` -> promise (biar pesan diproses berurutan, nggak ada yang kelewat)
const ownReplies = new Map(); // `${jid}|${text}` -> expiry (cegah bot jawab balasannya sendiri)

function rememberOwn(jid, text) {
  const now = Date.now();
  ownReplies.set(`${jid}|${text}`, now + 120000);
  for (const [k, exp] of ownReplies) if (exp < now) ownReplies.delete(k);
}
function isOwnReply(jid, text) {
  return ownReplies.has(`${jid}|${text}`);
}

function buildPrompt(hist, userText) {
  let ctx = '';
  for (const h of hist.slice(-MAX_TURNS)) ctx += `${h.role === 'user' ? 'User' : 'AI'}: ${h.text.slice(0, 400)}\n`;
  let prompt = `${PERSONA}\n\n${ctx ? 'Obrolan sebelumnya:\n' + ctx + '\n' : ''}Pesan baru dari User: ${userText.slice(0, 800)}\n\nBalas sebagai AI (langsung jawabannya saja):`;
  if (prompt.length > 3500) prompt = `${PERSONA}\n\nPesan dari User: ${userText.slice(0, 800)}\n\nBalas sebagai AI (langsung jawabannya saja):`;
  return prompt;
}

async function askAI(key, userText) {
  const hist = history.get(key) || [];
  history.set(key, hist);
  const prompt = buildPrompt(hist, userText);
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.get(AI_URL, { params: { text: prompt }, timeout: 45000, maxRedirects: 5 });
      const out = typeof data === 'string' ? data : data?.result ?? data?.data ?? data?.message ?? data?.answer;
      if (data?.status === false) throw new Error('API status false');
      if (out && String(out).trim()) {
        const reply = String(out).trim();
        hist.push({ role: 'user', text: userText }, { role: 'ai', text: reply });
        while (hist.length > MAX_TURNS) hist.shift();
        return reply;
      }
      throw new Error('respons kosong');
    } catch (e) {
      lastErr = e;
      console.error(`[chatai] percobaan ${i + 1} gagal:`, e.response?.status || '', e.message);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw lastErr || new Error('AI gagal');
}

// antrean per chat: pesan masuk diproses satu-satu, nggak ada yang dibuang
function enqueue(jid, fn) {
  const prev = chains.get(jid) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(jid, next.catch(() => {}));
  return next;
}

async function sendReply(sock, jid, msg, text) {
  rememberOwn(jid, text);
  return sock.sendMessage(jid, { text }, { quoted: msg });
}

// .chatai on|off
async function cmdChatAi(sock, msg, jid, senderJid, text) {
  const mode = (text || '').trim().toLowerCase();
  const isGroup = jid.endsWith('@g.us');
  if (!['on', 'off'].includes(mode)) {
    const now = getGroupSettings(jid).chatai ? 'ON ✅' : 'OFF ❌';
    return sock.sendMessage(jid, { text: `🤖 Chat AI di sini sekarang: *${now}*\n\n*.chatai on* → AI jawab semua pesan\n*.chatai off* → AI berhenti` }, { quoted: msg });
  }
  if (isGroup) {
    const { isSenderAdmin } = require('./group');
    const ok = msg.key.fromMe || (await isSenderAdmin(sock, jid, senderJid).catch(() => false));
    if (!ok) return sock.sendMessage(jid, { text: '❌ Cuma admin grup yang boleh nyalain/matiin Chat AI.' }, { quoted: msg });
  }
  setGroupSetting(jid, 'chatai', mode === 'on');
  if (mode === 'off') for (const k of history.keys()) if (k.startsWith(jid + '|')) history.delete(k);
  const t =
    mode === 'on'
      ? '✅ Chat AI *AKTIF*. Semua pesan biasa di chat ini bakal dijawab AI.\nReaksi di pesanmu: ⏳ = lagi mikir, 🤖 = udah dijawab, ❌ = gagal.\nKetik *.chatai off* buat berhenti.'
      : '🛑 Chat AI *dimatikan*. Bot balik normal (cuma jawab perintah).';
  return sendReply(sock, jid, msg, t);
}

// Dipanggil untuk pesan non-perintah. Return true kalau pesan ini ditangani AI.
async function handleChatAi(sock, msg, jid, senderJid, text) {
  if (!text || text.length < 2) return false;
  if (!getGroupSettings(jid).chatai) return false;
  if (isOwnReply(jid, text)) return false;
  const key = `${jid}|${senderJid}`;
  await react(sock, msg, '⏳');
  enqueue(jid, async () => {
    try {
      sock.sendPresenceUpdate('composing', jid).catch(() => {});
      const reply = await askAI(key, text);
      await sendReply(sock, jid, msg, reply);
      await react(sock, msg, '🤖');
    } catch (e) {
      console.error('[chatai] gagal total:', e.message);
      await react(sock, msg, '❌');
      await sendReply(sock, jid, msg, '❌ AI-nya lagi nggak bisa jawab, coba kirim ulang bentar lagi ya.');
    }
  });
  return true;
}

module.exports = { cmdChatAi, handleChatAi, isOwnReply };
  
