const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');
const crypto = require('crypto');

const COLORS = {
  m: { name: 'Merah', hex: '#e53935', emoji: '🟥' },
  k: { name: 'Kuning', hex: '#f9c80e', emoji: '🟨' },
  h: { name: 'Hijau', hex: '#2e9e4f', emoji: '🟩' },
  b: { name: 'Biru', hex: '#1e6fd9', emoji: '🟦' },
};
const COLOR_KEYS = ['m', 'k', 'h', 'b'];
const COLOR_WORDS = { merah: 'm', kuning: 'k', hijau: 'h', biru: 'b', m: 'm', k: 'k', h: 'h', b: 'b' };
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const TURN_MS = 120000;
const FONT = '"DejaVu Sans", sans-serif';

const games = new Map(); // jid grup -> game
const stickerCache = new Map(); // kode kartu -> buffer webp
const hashToCode = new Map(); // sha256(base64) stiker -> kode kartu

const ALL_CODES = [];
for (const c of COLOR_KEYS) {
  ALL_CODES.push(c + '0');
  for (let n = 1; n <= 9; n++) ALL_CODES.push(c + n);
  ALL_CODES.push(c + 's', c + 'r', c + '+2');
}
ALL_CODES.push('w', 'w4');

// ---------- util kartu ----------
function val(code) {
  if (code === 'w') return 'w';
  if (code === 'w4') return '+4';
  return code.slice(1);
}

function fmtCard(code) {
  if (code === 'w') return '🌈 Wild';
  if (code === 'w4') return '🌈 Wild +4';
  const v = val(code);
  const label = v === 's' ? 'Skip' : v === 'r' ? 'Reverse' : v;
  return `${COLORS[code[0]].emoji} ${label}`;
}

function normalizeCode(raw) {
  let s = String(raw || '').toLowerCase().replace(/[\s_-]/g, '');
  for (const [word, key] of Object.entries({ merah: 'm', kuning: 'k', hijau: 'h', biru: 'b' })) {
    if (s.startsWith(word)) s = key + s.slice(word.length);
  }
  s = s.replace('wild+4', 'w4').replace('w+4', 'w4').replace('wild', 'w').replace('skip', 's').replace('reverse', 'r');
  return ALL_CODES.includes(s) ? s : null;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  const deck = [];
  for (const c of COLOR_KEYS) {
    deck.push(c + '0');
    for (let n = 1; n <= 9; n++) deck.push(c + n, c + n);
    for (const v of ['s', 'r', '+2']) deck.push(c + v, c + v);
  }
  for (let i = 0; i < 4; i++) deck.push('w', 'w4');
  return shuffle(deck);
}

function sortHand(hand) {
  const order = (c) => ({ m: 0, k: 1, h: 2, b: 3, w: 4 }[c[0]]);
  return [...hand].sort((a, b) => order(a) - order(b) || ALL_CODES.indexOf(a) - ALL_CODES.indexOf(b));
}

function canPlay(game, code) {
  if (code[0] === 'w') return true;
  if (code[0] === game.color) return true;
  return game.top[0] !== 'w' && val(code) === val(game.top);
}

// ---------- gambar kartu ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSymbol(ctx, v, cx, cy, w, isWild, ink) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (v === 'w') return;
  if (v === 's') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.14, cy + w * 0.14);
    ctx.lineTo(cx + w * 0.14, cy - w * 0.14);
    ctx.stroke();
    return;
  }
  if (v === 'r') {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = w * 0.06;
    const a = w * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - a, cy - w * 0.07);
    ctx.lineTo(cx + a * 0.5, cy - w * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + a * 0.5, cy - w * 0.17);
    ctx.lineTo(cx + a, cy - w * 0.07);
    ctx.lineTo(cx + a * 0.5, cy + w * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + a, cy + w * 0.07);
    ctx.lineTo(cx - a * 0.5, cy + w * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - a * 0.5, cy + w * 0.17);
    ctx.lineTo(cx - a, cy + w * 0.07);
    ctx.lineTo(cx - a * 0.5, cy - w * 0.03);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.font = `bold ${w * (v.length > 1 ? 0.3 : 0.42)}px ${FONT}`;
  if (isWild) {
    ctx.lineWidth = w * 0.03;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(v, cx, cy);
  }
  ctx.fillStyle = ink;
  ctx.fillText(v, cx, cy);
}

function drawCard(ctx, code, x, y, w, h) {
  const c = code[0];
  const v = val(code);
  const r = w * 0.12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  const m = w * 0.055;
  ctx.fillStyle = c === 'w' ? '#141414' : COLORS[c].hex;
  roundRect(ctx, x + m, y + m, w - 2 * m, h - 2 * m, r * 0.85);
  ctx.fill();

  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45);
  if (c === 'w') {
    ['m', 'b', 'h', 'k'].forEach((q, i) => {
      ctx.fillStyle = COLORS[q].hex;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.ellipse(0, 0, w * 0.34, h * 0.38, 0, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
    });
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.34, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawSymbol(ctx, v, cx, cy, w, c === 'w', c === 'w' ? '#ffffff' : COLORS[c].hex);

  const corner = v === 's' ? 'S' : v === 'r' ? 'R' : v === 'w' ? 'W' : v;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${w * 0.15}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(corner, x + w * 0.1, y + h * 0.045);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(corner, x + w * 0.9, y + h * 0.955);
}

async function cardSticker(code) {
  if (stickerCache.has(code)) return stickerCache.get(code);
  const canvas = createCanvas(512, 512);
  drawCard(canvas.getContext('2d'), code, 91, 16, 330, 480);
  const webp = await sharp(canvas.toBuffer('image/png')).webp({ quality: 90 }).toBuffer();
  stickerCache.set(code, webp);
  hashToCode.set(crypto.createHash('sha256').update(webp).digest('base64'), code);
  return webp;
}

async function ensureStickers() {
  for (const code of ALL_CODES) await cardSticker(code);
}

async function handImage(hand, title) {
  const cols = 7;
  const cw = 104;
  const ch = 150;
  const gap = 14;
  const labelH = 26;
  const top = 54;
  const rows = Math.max(1, Math.ceil(hand.length / cols));
  const width = cols * (cw + gap) + gap;
  const height = top + rows * (ch + labelH + gap) + gap;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b3d2e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, gap, top / 2);
  hand.forEach((code, i) => {
    const x = gap + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + labelH + gap);
    drawCard(ctx, code, x, y, cw, ch);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, x + cw / 2, y + ch + labelH / 2);
  });
  return sharp(canvas.toBuffer('image/png')).jpeg({ quality: 90 }).toBuffer();
}

// ---------- logika game ----------
const mention = (jid) => '@' + String(jid).split('@')[0];
const say = (sock, jid, text, mentions = []) => sock.sendMessage(jid, { text, mentions });

function lock(game, fn) {
  const run = (game.chain || Promise.resolve()).then(fn);
  game.chain = run.catch(() => {});
  return run;
}

function drawCards(game, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!game.deck.length) {
      if (!game.discard.length) break;
      game.deck = shuffle(game.discard.splice(0));
    }
    out.push(game.deck.pop());
  }
  return out;
}

function nextIdx(game, steps) {
  const n = game.players.length;
  return (((game.turn + game.dir * steps) % n) + n) % n;
}

async function sendTop(sock, jid, code) {
  await sock.sendMessage(jid, { sticker: await cardSticker(code) });
}

async function sendHand(sock, game, player, withStickers) {
  const hand = sortHand(game.hands.get(player) || []);
  try {
    const img = await handImage(hand, `Kartumu (${hand.length})`);
    const playable = [...new Set(hand.filter((c) => canPlay(game, c)))];
    let caption = `🂠 *Kartumu* — cuma kamu yang lihat\nKode: ${hand.join(' ')}`;
    if (withStickers) {
      caption += `\n\n✅ Bisa dimainkan: ${playable.length ? playable.map(fmtCard).join(', ') : 'tidak ada → ketik .uno draw'}`;
      caption += '\nKirim *stiker kartu* ke grup, atau ketik `.uno play <kode>`';
    }
    await sock.sendMessage(player, { image: img, caption });
    if (withStickers) {
      for (const code of playable.slice(0, 8)) await sock.sendMessage(player, { sticker: await cardSticker(code) });
    }
  } catch (e) {
    console.error('[uno] gagal kirim kartu ke', player, e.message);
    await say(sock, game.jid, `⚠️ Gagal kirim kartu ke ${mention(player)}. Coba ketik *.uno kartu*.`, [player]);
  }
}

function startTimer(sock, jid, game) {
  clearTimeout(game.timer);
  const token = ++game.token;
  game.timer = setTimeout(async () => {
    if (game.token !== token || game.status !== 'playing') return;
    const s = game.sock || sock;
    try {
      await lock(game, async () => {
        if (game.token !== token) return;
        const p = game.players[game.turn];
        if (game.pendingColor === p) {
          const color = COLOR_KEYS[Math.floor(Math.random() * 4)];
          await say(s, jid, `⏰ ${mention(p)} kelamaan, warna dipilih acak: ${COLORS[color].emoji} ${COLORS[color].name}`, [p]);
          await chooseColor(s, jid, game, p, color);
        } else {
          game.hands.get(p).push(...drawCards(game, 1));
          await say(s, jid, `⏰ ${mention(p)} kelamaan, otomatis ambil 1 kartu & giliran dilewati.`, [p]);
          await advance(s, jid, game, 1);
        }
      });
    } catch (e) {
      console.error('[uno] timer error:', e.message);
    }
  }, TURN_MS);
  if (game.timer.unref) game.timer.unref();
}

async function announceTurn(sock, jid, game) {
  const p = game.players[game.turn];
  const counts = game.players.map((x) => `${x === p ? '👉' : '▫️'} ${mention(x)}: ${game.hands.get(x).length} kartu`).join('\n');
  await say(
    sock,
    jid,
    `🎯 Giliran ${mention(p)}\nWarna: ${COLORS[game.color].emoji} ${COLORS[game.color].name} | Kartu atas: ${fmtCard(game.top)}\n\n${counts}\n\n_Kirim stiker kartu / .uno play <kode> / .uno draw_`,
    [p]
  );
  await sendHand(sock, game, p, true);
  startTimer(sock, jid, game);
}

async function advance(sock, jid, game, steps) {
  game.turn = nextIdx(game, steps);
  await announceTurn(sock, jid, game);
}

async function endWin(sock, jid, game, winner) {
  clearTimeout(game.timer);
  game.token++;
  game.status = 'ended';
  const board = game.players
    .filter((p) => p !== winner)
    .map((p) => `• ${mention(p)}: sisa ${game.hands.get(p).length} kartu`)
    .join('\n');
  games.delete(jid);
  await say(sock, jid, `🏆 *${mention(winner)} MENANG UNO!* 🎉\n\n${board}\n\nMain lagi? ketik *.uno join*`, game.players);
}

async function finishAfterColor(sock, jid, game, code) {
  let steps = 1;
  if (code === 'w4') {
    const victim = game.players[nextIdx(game, 1)];
    game.hands.get(victim).push(...drawCards(game, 4));
    await say(sock, jid, `💥 ${mention(victim)} ambil 4 kartu & giliran dilewati!`, [victim]);
    steps = 2;
  }
  game.pendingColor = null;
  game.pendingEffect = null;
  await say(sock, jid, `🎨 Warna sekarang: ${COLORS[game.color].emoji} ${COLORS[game.color].name}`);
  await advance(sock, jid, game, steps);
}

async function chooseColor(sock, jid, game, player, color) {
  game.color = color;
  await finishAfterColor(sock, jid, game, game.pendingEffect);
}

async function playCard(sock, jid, game, player, code, colorArg, viaSticker) {
  const hand = game.hands.get(player);
  const idx = hand.indexOf(code);
  if (idx === -1) return say(sock, jid, `❌ ${mention(player)}, kartu ${fmtCard(code)} nggak ada di tanganmu.`, [player]);
  if (!canPlay(game, code)) {
    return say(sock, jid, `❌ ${fmtCard(code)} nggak cocok. Harus warna ${COLORS[game.color].emoji} ${COLORS[game.color].name} atau sama dengan ${fmtCard(game.top)}.`);
  }
  hand.splice(idx, 1);
  game.discard.push(game.top);
  game.top = code;
  clearTimeout(game.timer);
  game.token++;
  if (!viaSticker) await sendTop(sock, jid, code);
  await say(sock, jid, `🃏 ${mention(player)} memainkan ${fmtCard(code)}`, [player]);

  if (hand.length === 0) return endWin(sock, jid, game, player);
  if (hand.length === 1) await say(sock, jid, `🔔 *UNO!* ${mention(player)} tinggal 1 kartu!`, [player]);

  const c = code[0];
  const v = val(code);
  if (c === 'w') {
    if (colorArg) {
      game.color = colorArg;
      return finishAfterColor(sock, jid, game, code);
    }
    game.pendingColor = player;
    game.pendingEffect = code;
    await say(sock, jid, `🎨 ${mention(player)}, pilih warna: ketik *.uno warna merah|kuning|hijau|biru*`, [player]);
    return startTimer(sock, jid, game);
  }

  game.color = c;
  let steps = 1;
  if (v === 's') {
    steps = 2;
  } else if (v === 'r') {
    game.dir *= -1;
    steps = game.players.length === 2 ? 2 : 1;
  } else if (v === '+2') {
    const victim = game.players[nextIdx(game, 1)];
    game.hands.get(victim).push(...drawCards(game, 2));
    await say(sock, jid, `💥 ${mention(victim)} ambil 2 kartu & giliran dilewati!`, [victim]);
    steps = 2;
  }
  return advance(sock, jid, game, steps);
}

async function startGame(sock, jid, game) {
  await ensureStickers();
  game.deck = buildDeck();
  game.discard = [];
  game.hands = new Map();
  for (const p of game.players) game.hands.set(p, drawCards(game, 7));
  let first;
  do {
    first = game.deck.pop();
    if (first[0] === 'w') game.deck.unshift(first);
  } while (first[0] === 'w');
  game.top = first;
  game.color = first[0];
  game.dir = 1;
  game.turn = Math.floor(Math.random() * game.players.length);
  game.status = 'playing';
  game.pendingColor = null;
  game.token = 0;
  game.jid = jid;
  game.sock = sock;
  await say(sock, jid, `🃏 *UNO DIMULAI!* (${game.players.length} pemain)\nKartu kalian dikirim lewat *chat pribadi* dari bot ini.`, game.players);
  await sendTop(sock, jid, first);
  for (const p of game.players) await sendHand(sock, game, p, false);
  await announceTurn(sock, jid, game);
}

async function isGroupAdmin(sock, jid, who) {
  try {
    const meta = await sock.groupMetadata(jid);
    const p = meta.participants.find((x) => x.id === who);
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch (e) {
    return false;
  }
}

const HELP =
  `🃏 *UNO* (2-8 pemain)\n\n` +
  `*.uno join* — gabung / buat lobi\n` +
  `*.uno start* — mulai game (host)\n` +
  `*.uno play <kode>* — main kartu, mis. .uno play m5\n` +
  `*.uno warna <warna>* — pilih warna setelah Wild\n` +
  `*.uno draw* — ambil 1 kartu (giliran lewat)\n` +
  `*.uno kartu* — kirim ulang kartumu\n` +
  `*.uno status* — lihat papan\n` +
  `*.uno keluar* — keluar dari game\n` +
  `*.uno end* — akhiri game (host/admin)\n\n` +
  `*Kode kartu:* m=merah k=kuning h=hijau b=biru\n` +
  `angka 0-9, s=skip, r=reverse, +2, w=wild, w4=wild +4\n` +
  `Contoh: m5, ks, hr, b+2, w, w4\n\n` +
  `*Cara main:* kartumu dikirim ke chat pribadi. Kirim *stiker kartu* itu ke grup untuk memainkannya.`;

async function cmdUno(sock, msg, jid, senderJid, argText) {
  if (!jid.endsWith('@g.us')) return say(sock, jid, 'UNO cuma bisa dimainkan di dalam grup.');
  const parts = (argText || '').trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || 'help').toLowerCase();
  const rest = parts.slice(1);
  let game = games.get(jid);
  if (game) game.sock = sock;

  if (sub === 'help' || sub === 'bantuan') return say(sock, jid, HELP);

  if (sub === 'join' || sub === 'gabung') {
    if (!game) {
      game = { status: 'lobby', host: senderJid, players: [senderJid], jid, sock };
      games.set(jid, game);
      return say(sock, jid, `🃏 *Lobi UNO dibuka* oleh ${mention(senderJid)}\nPemain (1/${MAX_PLAYERS}): ${mention(senderJid)}\n\nKetik *.uno join* untuk ikut. Host ketik *.uno start* kalau sudah minimal ${MIN_PLAYERS} orang.`, [senderJid]);
    }
    if (game.status !== 'lobby') return say(sock, jid, 'Game lagi berjalan, tunggu selesai ya.');
    if (game.players.includes(senderJid)) return say(sock, jid, 'Kamu sudah ikut.');
    if (game.players.length >= MAX_PLAYERS) return say(sock, jid, `Lobi penuh (maks ${MAX_PLAYERS} pemain).`);
    game.players.push(senderJid);
    return say(sock, jid, `✅ ${mention(senderJid)} bergabung.\nPemain (${game.players.length}/${MAX_PLAYERS}):\n${game.players.map(mention).join('\n')}`, game.players);
  }

  if (!game) return say(sock, jid, 'Belum ada game. Ketik *.uno join* untuk bikin lobi.');

  if (sub === 'start' || sub === 'mulai') {
    if (game.status !== 'lobby') return say(sock, jid, 'Game sudah berjalan.');
    if (senderJid !== game.host) return say(sock, jid, `Cuma host (${mention(game.host)}) yang bisa memulai.`, [game.host]);
    if (game.players.length < MIN_PLAYERS) return say(sock, jid, `Minimal ${MIN_PLAYERS} pemain untuk mulai.`);
    return startGame(sock, jid, game);
  }

  if (sub === 'end' || sub === 'stop') {
    if (senderJid !== game.host && !(await isGroupAdmin(sock, jid, senderJid))) {
      return say(sock, jid, 'Cuma host atau admin grup yang bisa mengakhiri game.');
    }
    clearTimeout(game.timer);
    game.token = (game.token || 0) + 1;
    game.status = 'ended';
    games.delete(jid);
    return say(sock, jid, '🛑 Game UNO diakhiri.');
  }

  if (sub === 'keluar' || sub === 'leave') {
    if (!game.players.includes(senderJid)) return say(sock, jid, 'Kamu nggak ikut game ini.');
    if (game.status === 'lobby') {
      game.players = game.players.filter((p) => p !== senderJid);
      if (!game.players.length) {
        games.delete(jid);
        return say(sock, jid, 'Lobi kosong, ditutup.');
      }
      if (game.host === senderJid) game.host = game.players[0];
      return say(sock, jid, `👋 ${mention(senderJid)} keluar. Host sekarang ${mention(game.host)}.`, [game.host]);
    }
    return lock(game, async () => {
      const i = game.players.indexOf(senderJid);
      const wasTurn = i === game.turn;
      game.discard.push(...(game.hands.get(senderJid) || []));
      game.hands.delete(senderJid);
      game.players.splice(i, 1);
      await say(sock, jid, `👋 ${mention(senderJid)} keluar dari game.`, [senderJid]);
      if (game.players.length < 2) return endWin(sock, jid, game, game.players[0]);
      if (i < game.turn) game.turn -= 1;
      else if (wasTurn) {
        game.turn = game.dir === 1 ? i % game.players.length : (i - 1 + game.players.length) % game.players.length;
        game.pendingColor = null;
        return announceTurn(sock, jid, game);
      }
    });
  }

  if (sub === 'status' || sub === 'papan') {
    if (game.status === 'lobby') return say(sock, jid, `🃏 Lobi UNO (${game.players.length}/${MAX_PLAYERS}):\n${game.players.map(mention).join('\n')}\nHost: ${mention(game.host)}`, [game.host]);
    return say(sock, jid, `🃏 *UNO berjalan*\nGiliran: ${mention(game.players[game.turn])}\nWarna: ${COLORS[game.color].emoji} ${COLORS[game.color].name} | Kartu atas: ${fmtCard(game.top)}\n\n${game.players.map((x) => `${mention(x)}: ${game.hands.get(x).length} kartu`).join('\n')}`, [game.players[game.turn]]);
  }

  if (game.status !== 'playing') return say(sock, jid, 'Game belum dimulai. Host ketik *.uno start*.');
  if (!game.players.includes(senderJid)) return say(sock, jid, 'Kamu bukan pemain di game ini.');

  if (sub === 'kartu' || sub === 'hand') {
    await sendHand(sock, game, senderJid, game.players[game.turn] === senderJid && !game.pendingColor);
    return say(sock, jid, `📩 ${mention(senderJid)}, kartumu sudah dikirim ke chat pribadi.`, [senderJid]);
  }

  return lock(game, async () => {
    if (game.status !== 'playing') return;
    if (game.players[game.turn] !== senderJid) return say(sock, jid, `⏳ ${mention(senderJid)}, sekarang giliran ${mention(game.players[game.turn])}.`, [senderJid, game.players[game.turn]]);

    if (sub === 'warna' || sub === 'color') {
      if (game.pendingColor !== senderJid) return say(sock, jid, 'Nggak ada warna yang perlu dipilih sekarang.');
      const color = COLOR_WORDS[(rest[0] || '').toLowerCase()];
      if (!color) return say(sock, jid, 'Pilih: *merah*, *kuning*, *hijau*, atau *biru*.');
      clearTimeout(game.timer);
      game.token++;
      return chooseColor(sock, jid, game, senderJid, color);
    }

    if (game.pendingColor) return say(sock, jid, `🎨 ${mention(senderJid)}, pilih warna dulu: *.uno warna merah|kuning|hijau|biru*`, [senderJid]);

    if (sub === 'draw' || sub === 'ambil') {
      clearTimeout(game.timer);
      game.token++;
      game.hands.get(senderJid).push(...drawCards(game, 1));
      await say(sock, jid, `🃏 ${mention(senderJid)} mengambil 1 kartu & giliran dilewati.`, [senderJid]);
      return advance(sock, jid, game, 1);
    }

    if (sub === 'play' || sub === 'main') {
      const code = normalizeCode(rest[0]);
      if (!code) return say(sock, jid, 'Kode kartu nggak dikenal. Contoh: *.uno play m5*, *.uno play w b*. Ketik *.uno help* untuk daftar kode.');
      const colorArg = code[0] === 'w' ? COLOR_WORDS[(rest[1] || '').toLowerCase()] : null;
      return playCard(sock, jid, game, senderJid, code, colorArg, false);
    }

    return say(sock, jid, 'Perintah nggak dikenal. Ketik *.uno help*.');
  });
}

// Dipanggil untuk setiap pesan di grup: kalau itu stiker kartu UNO yang valid, dianggap main kartu.
async function handleSticker(sock, msg, jid, senderJid) {
  const st = msg.message && msg.message.stickerMessage;
  if (!st || !st.fileSha256 || !jid.endsWith('@g.us')) return false;
  const game = games.get(jid);
  if (!game || game.status !== 'playing') return false;
  const code = hashToCode.get(Buffer.from(st.fileSha256).toString('base64'));
  if (!code) return false;
  game.sock = sock;
  if (!game.players.includes(senderJid)) return true;
  await lock(game, async () => {
    if (game.status !== 'playing') return;
    if (game.players[game.turn] !== senderJid) return say(sock, jid, `⏳ ${mention(senderJid)}, bukan giliranmu.`, [senderJid]);
    if (game.pendingColor) return say(sock, jid, `🎨 ${mention(senderJid)}, pilih warna dulu: *.uno warna merah|kuning|hijau|biru*`, [senderJid]);
    return playCard(sock, jid, game, senderJid, code, null, true);
  });
  return true;
}

module.exports = { cmdUno, handleSticker, _test: { games, hashToCode, cardSticker, ensureStickers, canPlay, normalizeCode, val } };
