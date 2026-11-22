const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('./quizData');
const { react } = require('../lib/react');

const QUESTIONS_PER_GAME = 10;
const TIME_LIMIT = 15; // detik
const FILE = path.join(__dirname, '..', 'data', 'quiz.json');
const LETTERS = ['A', 'B', 'C', 'D'];

const games = new Map(); // jid -> game
const recent = {}; // kategori -> indeks soal yang baru keluar (biar nggak ngulang terus)

// ---------- leaderboard mingguan (reset otomatis tiap ganti minggu) ----------
function weekKey(d = new Date()) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000); // WITA
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function loadBoard() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    if (d.week === weekKey()) return d;
  } catch (e) { /* belum ada */ }
  return { week: weekKey(), chats: {} };
}
function saveBoard(d) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(d));
  } catch (e) {
    console.error('[kuis] gagal simpan leaderboard:', e.message);
  }
}
function addWeekly(jid, players) {
  const b = loadBoard();
  const chat = (b.chats[jid] = b.chats[jid] || {});
  for (const [id, p] of players) {
    const cur = chat[id] || { name: p.name, points: 0, correct: 0 };
    cur.name = p.name || cur.name;
    cur.points += p.points;
    cur.correct += p.correct;
    chat[id] = cur;
  }
  saveBoard(b);
}

const num = (jid) => '@' + jid.split('@')[0];
const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function pickQuestions(cat) {
  const all = CATEGORIES[cat].questions;
  const seen = (recent[cat] = recent[cat] || []);
  let pool = all.map((_, i) => i).filter((i) => !seen.includes(i));
  if (pool.length < QUESTIONS_PER_GAME) { recent[cat] = []; pool = all.map((_, i) => i); }
  const chosen = shuffle(pool).slice(0, QUESTIONS_PER_GAME);
  recent[cat].push(...chosen);
  return chosen.map((i) => {
    const [q, correct, ...wrong] = all[i];
    const opts = shuffle([correct, ...wrong]);
    return { q, opts, answer: opts.indexOf(correct), correct };
  });
}

function help() {
  return (
    `🧠 *KUIS* — ${QUESTIONS_PER_GAME} soal, ${TIME_LIMIT} detik per soal\n\n` +
    Object.entries(CATEGORIES).map(([k, v]) => `${v.emoji} *.kuis ${k}*`).join('\n') +
    `\n\n🏆 *.kuis top* — leaderboard mingguan grup ini\n🛑 *.kuis stop* — hentikan kuis\n\n` +
    `Cara jawab: ketik huruf *A / B / C / D* langsung di chat. Makin cepat, makin besar poinnya!`
  );
}

async function cmdKuis(sock, msg, jid, senderJid, text) {
  const arg = (text || '').trim().toLowerCase();
  if (!arg || arg === 'help') return sock.sendMessage(jid, { text: help() }, { quoted: msg });

  if (arg === 'top' || arg === 'leaderboard') {
    const b = loadBoard();
    const rows = Object.entries(b.chats[jid] || {}).sort((a, c) => c[1].points - a[1].points).slice(0, 10);
    if (!rows.length) return sock.sendMessage(jid, { text: `🏆 Leaderboard minggu ini (${b.week}) masih kosong.\nMulai kuis dulu: *.kuis horror*` }, { quoted: msg });
    const body = rows.map(([id, p], i) => `${medal(i)} ${num(id)} — *${p.points}* poin (${p.correct} benar)`).join('\n');
    return sock.sendMessage(jid, { text: `🏆 *LEADERBOARD MINGGUAN* (${b.week})\n\n${body}\n\n_Reset otomatis tiap minggu baru_`, mentions: rows.map((r) => r[0]) }, { quoted: msg });
  }

  if (arg === 'stop') {
    const g = games.get(jid);
    if (!g) return sock.sendMessage(jid, { text: 'Nggak ada kuis yang lagi jalan.' }, { quoted: msg });
    return finish(sock, jid, g, 'dihentikan');
  }

  if (!CATEGORIES[arg]) return sock.sendMessage(jid, { text: help() }, { quoted: msg });
  if (games.has(jid)) return sock.sendMessage(jid, { text: '⏳ Masih ada kuis yang jalan di chat ini. Ketik *.kuis stop* kalau mau berhenti.' }, { quoted: msg });

  const g = { cat: arg, questions: pickQuestions(arg), idx: -1, players: new Map(), timer: null, token: 0, silent: 0, current: null };
  games.set(jid, g);
  const c = CATEGORIES[arg];
  await sock.sendMessage(jid, { text: `${c.emoji} *KUIS ${c.name.toUpperCase()}* dimulai!\n${QUESTIONS_PER_GAME} soal • ${TIME_LIMIT} detik per soal\nJawab dengan ketik *A / B / C / D*. Siap-siap... 🔥` }, { quoted: msg });
  setTimeout(() => nextQuestion(sock, jid, g), 3000);
}

async function nextQuestion(sock, jid, g) {
  if (games.get(jid) !== g) return;
  g.idx += 1;
  if (g.idx >= g.questions.length) return finish(sock, jid, g, 'selesai');
  const q = g.questions[g.idx];
  g.current = { answered: new Map(), startedAt: Date.now(), closed: false };
  const c = CATEGORIES[g.cat];
  const body = q.opts.map((o, i) => `*${LETTERS[i]}.* ${o}`).join('\n');
  await sock.sendMessage(jid, { text: `${c.emoji} *Soal ${g.idx + 1}/${g.questions.length}*\n\n${q.q}\n\n${body}\n\n⏱️ ${TIME_LIMIT} detik — ketik A/B/C/D` });
  const token = ++g.token;
  g.timer = setTimeout(() => closeQuestion(sock, jid, g, token), TIME_LIMIT * 1000);
}

async function closeQuestion(sock, jid, g, token) {
  if (games.get(jid) !== g || g.token !== token || !g.current || g.current.closed) return;
  g.current.closed = true;
  const q = g.questions[g.idx];
  const winners = [...g.current.answered.entries()].filter(([, a]) => a.ok);
  g.silent = g.current.answered.size === 0 ? g.silent + 1 : 0;
  let t = `✅ Jawaban: *${LETTERS[q.answer]}. ${q.correct}*\n`;
  t += winners.length ? winners.map(([id, a]) => `${num(id)} +${a.points}`).join('  ') : '😅 Nggak ada yang bener.';
  await sock.sendMessage(jid, { text: t, mentions: winners.map(([id]) => id) });
  if (g.silent >= 2) return finish(sock, jid, g, 'dihentikan karena nggak ada yang jawab 2 soal berturut-turut');
  setTimeout(() => nextQuestion(sock, jid, g), 2500);
}

async function finish(sock, jid, g, why) {
  clearTimeout(g.timer);
  g.token++;
  games.delete(jid);
  const rows = [...g.players.entries()].sort((a, b) => b[1].points - a[1].points);
  if (!rows.length) return sock.sendMessage(jid, { text: `🏁 Kuis ${why}. Belum ada yang main.` });
  addWeekly(jid, rows);
  const body = rows.map(([id, p], i) => `${medal(i)} ${num(id)} — *${p.points}* poin (${p.correct} benar)`).join('\n');
  await sock.sendMessage(jid, { text: `🏁 *KUIS ${why.toUpperCase()}!*\n\n${body}\n\nCek peringkat mingguan: *.kuis top*`, mentions: rows.map((r) => r[0]) });
}

// Dipanggil untuk pesan biasa. true = pesan ini jawaban kuis (sudah ditangani)
async function handleAnswer(sock, msg, jid, senderJid, text) {
  const g = games.get(jid);
  if (!g || !g.current || g.current.closed) return false;
  const m = (text || '').trim().toLowerCase().match(/^([abcd])[.!)]?$/);
  if (!m) return false;
  const cur = g.current;
  if (cur.answered.has(senderJid)) return true; // cuma boleh sekali per soal
  const idx = 'abcd'.indexOf(m[1]);
  const q = g.questions[g.idx];
  const ok = idx === q.answer;
  const left = Math.max(0, TIME_LIMIT - (Date.now() - cur.startedAt) / 1000);
  const points = ok ? 10 + Math.ceil(left / 3) : 0; // 10 poin dasar + bonus kecepatan (maks +5)
  cur.answered.set(senderJid, { ok, points });
  const p = g.players.get(senderJid) || { name: msg.pushName || '', points: 0, correct: 0 };
  p.points += points;
  if (ok) p.correct += 1;
  g.players.set(senderJid, p);
  await react(sock, msg, ok ? '✅' : '❌');
  return true;
}

const isActive = (jid) => games.has(jid);

module.exports = { cmdKuis, handleAnswer, isActive };
                                 
