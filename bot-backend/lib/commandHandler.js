const helpers = require('./helpers');
const { getSettings } = require('./settings');
const menu = require('../commands/menu');
const sticker = require('../commands/sticker');
const meme = require('../commands/meme');
const nexa = require('../commands/nexa');
const enhance = require('../commands/enhance');
const extras = require('../commands/extras');
const antitagsw = require('../commands/antitagsw');
const downloader = require('../commands/downloader');
const tools = require('../commands/tools');
const group = require('../commands/group');
const uno = require('../commands/uno');
const ai = require('../commands/ai');
const iqc = require('../commands/iqc');
const aiimage = require('../commands/aiimage');
const quiz = require('../commands/quiz');
const sambung = require('../commands/sambung');

const PREFIX = process.env.BOT_PREFIX || '.';

// Cegah satu pesan diproses dua kali (penyebab bot membalas 2x)
const handled = new Map();
function alreadyHandled(id) {
  if (!id) return false;
  if (handled.has(id)) return true;
  handled.set(id, Date.now());
  if (handled.size > 500) handled.delete(handled.keys().next().value);
  return false;
}

async function react(sock, jid, msg, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
  } catch (e) {
    // abaikan kalau gagal kirim reaksi
  }
}

function emitLog(io, entry) {
  if (io) io.emit('log', { time: new Date().toISOString(), ...entry });
}

async function handleMessage(sock, msg, io) {
  if (alreadyHandled(msg.key.id)) return;

  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const text = helpers.getText(msg).trim();
  const pushName = msg.pushName || 'User';
  const isGroup = jid.endsWith('@g.us');

  const settings = getSettings();
  if (!settings.enabled) return;
  if (settings.runMode === 'group' && !isGroup) return;
  if (settings.runMode === 'dm' && isGroup) return;

  if (await antitagsw.checkAntiTagSw(sock, msg, jid, senderJid)) return;
  if (await group.checkAntilink(sock, msg, jid, senderJid, text)) return;

  if (await uno.handleSticker(sock, msg, jid, senderJid)) return;
  if (await uno.handleButtonReply(sock, msg, jid, senderJid)) return;

  if (!text.startsWith(PREFIX)) {
    if (await quiz.handleAnswer(sock, msg, jid, senderJid, text)) return; // jawaban kuis (A/B/C/D)
    if (await sambung.handleWord(sock, msg, jid, senderJid, text)) return; // sambung kata
    await ai.handleChatAi(sock, msg, jid, senderJid, text); // mode .chatai on
    return;
  }

  const body = text.slice(PREFIX.length).trim();
  const [cmdRaw, ...args] = body.split(' ');
  const cmd = (cmdRaw || '').toLowerCase();
  const argText = args.join(' ');

  const commands = {
    menu: () => sock.sendMessage(jid, { text: menu.mainMenu(pushName) }, { quoted: msg }),
    menusticker: () => sock.sendMessage(jid, { text: menu.stickerMenu() }, { quoted: msg }),
    menudownload: () => sock.sendMessage(jid, { text: menu.downloadMenu() }, { quoted: msg }),
    menutools: () => sock.sendMessage(jid, { text: menu.toolsMenu() }, { quoted: msg }),
    menugroup: () => sock.sendMessage(jid, { text: menu.groupMenu() }, { quoted: msg }),
    menuai: () => sock.sendMessage(jid, { text: menu.aiMenu() }, { quoted: msg }),
    menugame: () => sock.sendMessage(jid, { text: menu.gameMenu() }, { quoted: msg }),

    sticker: () => sticker.cmdSticker(sock, msg, jid),
    s: () => sticker.cmdSticker(sock, msg, jid),
    toimg: () => sticker.cmdToImg(sock, msg, jid),
    brat: () => sticker.cmdBrat(sock, msg, jid, argText),
    bratvid: () => sticker.cmdBratVid(sock, msg, jid, argText),
    bratvid2: () => nexa.cmdBratVid2(sock, msg, jid, argText),
    iqc: () => iqc.cmdIqc(sock, msg, jid, helpers, argText),
    smeme: () => meme.cmdSmeme(sock, msg, jid, argText),
    nokia: () => nexa.cmdNokia(sock, msg, jid, argText, pushName),

    tiktok: () => downloader.cmdTiktok(sock, msg, jid, argText),
    tt: () => downloader.cmdTiktok(sock, msg, jid, argText),
    ig: () => downloader.cmdInstagram(sock, msg, jid, argText),
    fb: () => downloader.cmdFacebook(sock, msg, jid, argText),
    yt: () => downloader.cmdYoutube(sock, msg, jid, argText, 'video'),
    ytmp4: () => downloader.cmdYoutube(sock, msg, jid, argText, 'video'),
    ytmp3: () => downloader.cmdYoutube(sock, msg, jid, argText, 'audio'),
    play: () => downloader.cmdPlay(sock, msg, jid, argText),
    pinterest: () => downloader.cmdPinterest(sock, msg, jid, argText),
    twitter: () => downloader.cmdTwitter(sock, msg, jid, argText),
    x: () => downloader.cmdTwitter(sock, msg, jid, argText),

    translate: () => tools.cmdTranslate(sock, msg, jid, argText),
    tts: () => tools.cmdTts(sock, msg, jid, argText),
    ss: () => tools.cmdScreenshot(sock, msg, jid, argText),
    shortlink: () => tools.cmdShortlink(sock, msg, jid, argText),
    cuaca: () => tools.cmdWeather(sock, msg, jid, argText),
    qrcode: () => tools.cmdQrcode(sock, msg, jid, argText),
    kurs: () => tools.cmdKurs(sock, msg, jid, argText),
    fakta: () => tools.cmdFakta(sock, msg, jid),
    chatai: () => ai.cmdChatAi(sock, msg, jid, senderJid, argText),
    wink: () => aiimage.cmdWinkApi(sock, msg, jid, argText, enhance, false),
    remini: () => aiimage.cmdWinkApi(sock, msg, jid, argText, enhance, true),
    toanime: () => aiimage.cmdToAnime(sock, msg, jid),
    tokartun: () => aiimage.cmdToKartun(sock, msg, jid),
    tocartoon: () => aiimage.cmdToKartun(sock, msg, jid),
    to3d: () => aiimage.cmdTo3D(sock, msg, jid),
    topixar: () => aiimage.cmdTo3D(sock, msg, jid),
    tosketsa: () => aiimage.cmdToSketsa(sock, msg, jid),
    tohitamputih: () => aiimage.cmdToBW(sock, msg, jid),
    foto: () => aiimage.cmdFoto(sock, msg, jid, argText),
    removebg: () => aiimage.cmdRemoveBg(sock, msg, jid),
    hapus: () => (/^bg\b/i.test(argText || '') ? aiimage.cmdRemoveBg(sock, msg, jid) : sock.sendMessage(jid, { text: 'Maksudnya *.hapus bg* ya? (kirim/reply foto)' }, { quoted: msg })),
    kuis: () => quiz.cmdKuis(sock, msg, jid, senderJid, argText),
    sambung: () => sambung.cmdSambung(sock, msg, jid, senderJid, argText),
    sambungkata: () => sambung.cmdSambung(sock, msg, jid, senderJid, argText),
    tebak: () => sambung.cmdSambung(sock, msg, jid, senderJid, argText),
    tebakkata: () => sambung.cmdSambung(sock, msg, jid, senderJid, argText),
    ttstalk: () => extras.cmdTtStalk(sock, msg, jid, argText),
    rndmanime: () => extras.cmdRandomAnime(sock, msg, jid),
    rndmmeme: () => extras.cmdRandomMeme(sock, msg, jid),

    kick: () => group.cmdKick(sock, msg, jid, senderJid),
    add: () => group.cmdAdd(sock, msg, jid, senderJid, argText),
    promote: () => group.cmdPromote(sock, msg, jid, senderJid),
    demote: () => group.cmdDemote(sock, msg, jid, senderJid),
    hidetag: () => group.cmdHidetag(sock, msg, jid, senderJid, argText),
    antilink: () => group.cmdAntilink(sock, msg, jid, senderJid, argText),
    antitagsw: () => antitagsw.cmdAntiTagSw(sock, msg, jid, senderJid, argText),
    welcome: () => group.cmdWelcome(sock, msg, jid, senderJid, argText),
    goodbye: () => group.cmdGoodbye(sock, msg, jid, senderJid, argText),
    setwelcome: () => group.cmdSetWelcome(sock, msg, jid, senderJid, argText),
    setdeskripsi: () => group.cmdSetDeskripsi(sock, msg, jid, senderJid, argText),
    swgc: () => group.cmdSwgc(sock, msg, jid, senderJid, argText),
    uno: () => uno.cmdUno(sock, msg, jid, senderJid, argText),
    groupopen: () => group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'open'),
    groupclose: () => group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'close'),
  };

  const run = commands[cmd];
  if (!run) return;

  await react(sock, jid, msg, '⌛');
  try {
    await run();
    await react(sock, jid, msg, '✅');
    emitLog(io, { cmd, from: senderJid, jid, status: 'ok' });
  } catch (err) {
    console.error('Command error:', err);
    await react(sock, jid, msg, '❌');
    await sock.sendMessage(jid, { text: '❌ ' + err.message }, { quoted: msg });
    emitLog(io, { cmd, from: senderJid, jid, status: 'error', message: err.message });
  }
}

module.exports = { handleMessage };
