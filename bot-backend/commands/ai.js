const axios = require('axios');
const { getGroupSettings, setGroupSetting } = require('../lib/store');

// Provider 1 (opsional, lebih stabil): Google Gemini kalau GEMINI_API_KEY diisi.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Provider 2 (TANPA API KEY, otomatis dipakai kalau Gemini nggak diisi / gagal): Pollinations.
const POLL_URL = 'https://text.pollinations.ai/openai/chat/completions';
const POLL_MODEL = process.env.POLLINATIONS_MODEL || 'openai-fast';

const SYSTEM_PROMPT = `Kamu adalah asisten AI di bot WhatsApp Indonesia. Kamu ramah, santai, ngobrol kayak teman deket, bukan kayak mesin pencari yang kaku.
- Pertanyaan pelajaran (matematika, sains, sejarah, dll): jelasin kayak guru privat yang sabar, bahasa gaul/santai, pakai analogi gampang, emoji secukupnya, tetap akurat dan jangan ngarang.
- Kalau orang curhat atau cuma pengen ngobrol: dengerin dan tanggepin dengan empati kayak teman, bukan kayak terapis formal.
- Jawab pakai Bahasa Indonesia gaul, panjang secukupnya (jangan kepanjangan kecuali diminta detail).
- Kalau nggak yakin atau nggak tau, jujur bilang nggak tau.`;

const MAX_HISTORY = 10;
const history = new Map(); // `${jid}|${sender}` -> [{role, content}]
const cooldown = new Map(); // key -> timestamp
const ownReplies = new Map(); // `${jid}|${text}` -> expiry, buat cegah bot jawab balasannya sendiri

function trim(h) {
  if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
}

function rememberOwn(jid, text) {
  const now = Date.now();
  ownReplies.set(`${jid}|${text}`, now + 120000);
  for (const [k, exp] of ownReplies) if (exp < now) ownReplies.delete(k);
}
function isOwnReply(jid, text) {
  return ownReplies.has(`${jid}|${text}`);
}

// Pollinations cuma ngizinin 1 request per IP sekaligus, jadi antrekan.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function callProvider(url, headers, model, messages) {
  const { data } = await axios.post(
    url,
    { model, messages, temperature: 0.8, max_tokens: 700 },
    { headers: { 'Content-Type': 'application/json', ...headers }, timeout: 45000 }
  );
  const out = data?.choices?.[0]?.message?.content;
  if (!out || !String(out).trim()) throw new Error('respons kosong');
  return String(out).trim();
}

async function askAI(key, userText) {
  const hist = history.get(key) || [];
  history.set(key, hist);
  hist.push({ role: 'user', content: userText });
  trim(hist);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...hist];

  let reply = null;
  let lastErr = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      reply = await callProvider(GEMINI_URL, { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` }, GEMINI_MODEL, messages);
    } catch (e) {
      lastErr = e;
      console.error('[ai] gemini gagal, coba Pollinations:', e.response?.status, e.message);
    }
  }
  if (!reply) {
    for (let i = 0; i < 2 && !reply; i++) {
      try {
        reply = await serial(() => callProvider(POLL_URL, {}, POLL_MODEL, messages));
      } catch (e) {
        lastErr = e;
        console.error('[ai] pollinations gagal:', e.response?.status, e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  if (!reply) {
    hist.pop();
    throw lastErr || new Error('AI gagal');
  }
  hist.push({ role: 'assistant', content: reply });
  trim(hist);
  return reply;
}

async function sendReply(sock, jid, msg, text) {
  rememberOwn(jid, text);
  return sock.sendMessage(jid, { text }, { quoted: msg });
}

// .ai <pertanyaan>  |  .ai reset
async function cmdAi(sock, msg, jid, senderJid, text) {
  const q = (text || '').trim();
  if (!q) {
    return sock.sendMessage(
      jid,
      {
        text:
          `🤖 *.ai* — tanya pelajaran atau ngobrol santai\n\n` +
          `Contoh:\n*.ai jelasin fotosintesis pake bahasa gaul*\n*.ai lagi capek banget hari ini*\n\n` +
          `*.ai reset* → mulai obrolan baru\n*.chatai on* → AI jawab semua chat di sini`,
      },
      { quoted: msg }
    );
  }
  const key = `${jid}|${senderJid}`;
  if (/^reset$/i.test(q)) {
    history.delete(key);
    return sendReply(sock, jid, msg, '🔄 Oke, obrolan di-reset. Mulai dari awal ya!');
  }
  try {
    sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const reply = await askAI(key, q);
    await sendReply(sock, jid, msg, reply);
  } catch (e) {
    await sendReply(sock, jid, msg, '❌ AI-nya lagi sibuk/gangguan, coba lagi beberapa detik lagi ya.');
  }
}

// .chatai on|off  — kalau on, semua pesan biasa (bukan perintah) di chat ini dijawab AI
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
  if (mode === 'off') {
    for (const k of history.keys()) if (k.startsWith(jid + '|')) history.delete(k);
  }
  const t = mode === 'on'
    ? '✅ Chat AI *AKTIF*. Sekarang semua pesan biasa di chat ini bakal dijawab AI.\nKetik *.chatai off* buat berhenti.'
    : '🛑 Chat AI *dimatikan*. Bot balik normal (cuma jawab perintah).';
  return sendReply(sock, jid, msg, t);
}

// Dipanggil untuk pesan non-perintah. Return true kalau pesan ini dijawab AI.
async function handleChatAi(sock, msg, jid, senderJid, text) {
  if (!text || text.length < 2) return false;
  if (!getGroupSettings(jid).chatai) return false;
  if (isOwnReply(jid, text)) return false;
  const key = `${jid}|${senderJid}`;
  const now = Date.now();
  if (now - (cooldown.get(key) || 0) < 3000) return true; // anti spam, abaikan diam-diam
  cooldown.set(key, now);
  try {
    sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const reply = await askAI(key, text);
    await sendReply(sock, jid, msg, reply);
  } catch (e) {
    console.error('[chatai] gagal:', e.message);
  }
  return true;
}

module.exports = { cmdAi, cmdChatAi, handleChatAi, isOwnReply };
  
