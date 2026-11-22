const { react } = require('../lib/react');

const TURN_SECONDS = 20;
const games = new Map(); // jid -> game

// Kata-kata yang dipakai bot (kata awal & jawaban bot di chat pribadi)
const WORDS = `sekolah hantu ular rumah hujan nasi ikan nanas sapi indonesia aksara abu udang gunung gajah harimau unta atap pintu ular rajawali ibu umbi ilmu ubi iga akar rambutan nangka angin nenek kakek kucing gudang garam mangga api ikan nasi ibadah hutan nyamuk kupu kali lima aman nama alat tanah hati ingat tangan nakal lampu ulat tebu usus sabun nuansa asap pisang gelas sepatu uang gula ayam mata api idola ambil lari ikan nusa aroma ayah hari ilham mimpi impian nada anak kunci ikat tali ingin nafas sahabat topi ikatan nyala api penyu udara air raja ajaib bulan nila angsa anggur rotan nelayan nikmat tumbuh hijau uap payung gantung gembira alam mobil layar rasa ambisi indah hormat tamu umur rindu usia atlet teman nelayan koran nanti ikhlas semut tikus selimut tenang gelombang gelap pelangi ikan nasib baju umat tabung gerbang gagah hebat tekun nusantara akhir rumput topan nikah halaman nafkah hemat tirai ilusi indra anggota awan nenas sungai ikan natal lilin nyata ayunan nakhoda angka akhlak kapal lautan nalar rakyat tiang gigi ide emas surat tulang gelombang gaya api kelas semangka angkasa ayat teras sabar rahasia asam mulut tungku ular rusa asing gambar rakit tombak kelapa air rem makan nila lemari ikan istana api akuarium mawar rimba api alasan nasihat taman nomor rambut tinta alis siang gubuk kaki ikan intan nanah hakim mantap pasar rawa asa asuh hasil lukisan nyawa api`.split(/\s+/).filter((w, i, a) => w.length >= 3 && a.indexOf(w) === i);
const byLetter = {};
for (const w of WORDS) (byLetter[w[0]] = byLetter[w[0]] || []).push(w);

const num = (jid) => '@' + jid.split('@')[0];
const up = (s) => s.toUpperCase();
const lastChar = (w) => w[w.length - 1];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function startWord() {
  const ok = WORDS.filter((w) => (byLetter[lastChar(w)] || []).length >= 3);
  return pick(ok);
}

function help() {
  return (
    `🔤 *SAMBUNG KATA*\n\n` +
    `Bot kasih satu kata, kamu sambung pakai *huruf terakhir*-nya.\nContoh: SEKOLAH → *H*ANTU → *U*LAR → *R*UMAH\n\n` +
    `*Aturan:*\n• Ketik 1 kata saja (huruf biasa, min. 3 huruf)\n• Kata nggak boleh diulang\n• Salah huruf / kata dobel = gugur\n• ${TURN_SECONDS} detik nggak ada yang nyambung = permainan selesai\n• Di grup: jawaban nggak boleh berturut-turut dari orang yang sama\n• Di chat pribadi: kamu lawan bot 🤖\n\n` +
    `*.sambung kata* — mulai\n*.sambung stop* — berhenti`
  );
}

async function cmdSambung(sock, msg, jid, senderJid, text) {
  const arg = (text || '').trim().toLowerCase();
  if (arg === 'stop') {
    const g = games.get(jid);
    if (!g) return sock.sendMessage(jid, { text: 'Nggak ada game sambung kata yang jalan.' }, { quoted: msg });
    return endGame(sock, jid, g, '🛑 Game dihentikan.');
  }
  if (arg === 'help') return sock.sendMessage(jid, { text: help() }, { quoted: msg });
  if (games.has(jid)) return sock.sendMessage(jid, { text: 'Game sambung kata masih jalan di sini. *.sambung stop* buat berhenti.' }, { quoted: msg });

  const word = startWord();
  const g = { word, used: new Set([word]), scores: new Map(), eliminated: new Set(), lastPlayer: null, timer: null, token: 0, isDM: !jid.endsWith('@g.us'), botScore: 0 };
  games.set(jid, g);
  armTimer(sock, jid, g);
  await sock.sendMessage(
    jid,
    { text: `🔤 *SAMBUNG KATA* dimulai!\n\nKata awal: *${up(word)}*\nSambung pakai huruf *${up(lastChar(word))}*  ⏱️ ${TURN_SECONDS} detik\n\n_Ketik satu kata saja. ${g.isDM ? 'Kamu lawan bot 🤖' : 'Siapa cepat, dia lanjut!'} (*.sambung help* buat aturan)_` },
    { quoted: msg }
  );
}

function armTimer(sock, jid, g) {
  clearTimeout(g.timer);
  const token = ++g.token;
  g.timer = setTimeout(() => timeUp(sock, jid, g, token), TURN_SECONDS * 1000);
}

function scoreboard(g) {
  const rows = [...g.scores.entries()].sort((a, b) => b[1] - a[1]);
  const body = rows.map(([id, n], i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${num(id)} — ${n} kata`).join('\n');
  return { body, mentions: rows.map((r) => r[0]) };
}

async function endGame(sock, jid, g, headline) {
  clearTimeout(g.timer);
  g.token++;
  games.delete(jid);
  const sb = scoreboard(g);
  let t = headline;
  if (g.isDM) t += `\n\nSkor kamu: ${[...g.scores.values()][0] || 0} kata • Skor bot: ${g.botScore} kata`;
  else if (sb.body) t += `\n\n📊 *Skor:*\n${sb.body}`;
  return sock.sendMessage(jid, { text: t, mentions: sb.mentions });
}

async function timeUp(sock, jid, g, token) {
  if (games.get(jid) !== g || g.token !== token) return;
  if (g.isDM) return endGame(sock, jid, g, `⏰ Waktu habis! Kamu kalah 😝\nKata terakhir: *${up(g.word)}*`);
  const winner = g.lastPlayer;
  return endGame(sock, jid, g, winner ? `⏰ Waktu habis! Nggak ada yang nyambung *${up(g.word)}*.\n🏆 Pemenang: ${num(winner)}` : `⏰ Waktu habis! Nggak ada yang main.`);
}

function validate(g, w) {
  const need = lastChar(g.word);
  if (w[0] !== need) return `harus diawali huruf *${up(need)}*`;
  if (g.used.has(w)) return 'kata itu sudah dipakai';
  if (!/[aiueo]/.test(w)) return 'itu bukan kata (nggak ada vokal)';
  if (/(.)\1\1/.test(w)) return 'itu bukan kata yang bener';
  return null;
}

// Dipanggil untuk pesan biasa. true = pesan ini bagian dari game (sudah ditangani)
async function handleWord(sock, msg, jid, senderJid, text) {
  const g = games.get(jid);
  if (!g) return false;
  const w = (text || '').trim().toLowerCase();
  if (!/^[a-z]{3,20}$/.test(w)) return false; // obrolan biasa, abaikan
  if (g.eliminated.has(senderJid)) return true;
  if (!g.isDM && senderJid === g.lastPlayer) {
    await react(sock, msg, '🚫');
    return true;
  }

  const bad = validate(g, w);
  if (bad) {
    await react(sock, msg, '❌');
    if (g.isDM) return endGame(sock, jid, g, `❌ Salah: ${bad}. Kamu kalah!\nKata terakhir: *${up(g.word)}*`);
    g.eliminated.add(senderJid);
    await sock.sendMessage(jid, { text: `💥 ${num(senderJid)} salah — ${bad}. Kamu gugur!\nLanjut: sambung *${up(g.word)}* pakai huruf *${up(lastChar(g.word))}*`, mentions: [senderJid] });
    return true;
  }

  g.used.add(w);
  g.word = w;
  g.lastPlayer = senderJid;
  g.scores.set(senderJid, (g.scores.get(senderJid) || 0) + 1);
  await react(sock, msg, '✅');

  if (g.isDM) {
    const options = (byLetter[lastChar(w)] || []).filter((x) => !g.used.has(x));
    if (!options.length) return endGame(sock, jid, g, `🤖 Bot nyerah, nggak ada kata berawalan *${up(lastChar(w))}*.\n🏆 Kamu menang!`);
    const botWord = pick(options);
    g.used.add(botWord);
    g.word = botWord;
    g.botScore += 1;
    armTimer(sock, jid, g);
    await sock.sendMessage(jid, { text: `🤖 *${up(botWord)}*\nSambung huruf *${up(lastChar(botWord))}*  ⏱️ ${TURN_SECONDS} detik` });
    return true;
  }

  armTimer(sock, jid, g);
  await sock.sendMessage(jid, { text: `➡️ *${up(w)}* (${num(senderJid)})\nSambung huruf *${up(lastChar(w))}*  ⏱️ ${TURN_SECONDS} detik`, mentions: [senderJid] });
  return true;
}

const isActive = (jid) => games.has(jid);

module.exports = { cmdSambung, handleWord, isActive };
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             
