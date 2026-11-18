const helpers = require('./helpers');
const menu = require('../commands/menu');
const sticker = require('../commands/sticker');
const downloader = require('../commands/downloader');
const tools = require('../commands/tools');
const group = require('../commands/group');

const PREFIX = process.env.BOT_PREFIX || '.';

async function react(sock, jid, msg, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
  } catch (e) {
    // abaikan kalau gagal kirim reaksi
  }
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const text = helpers.getText(msg).trim();
  const pushName = msg.pushName || 'User';

  if (await group.checkAntilink(sock, msg, jid, senderJid, text)) return;

  if (!text.startsWith(PREFIX)) return;

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

    sticker: () => sticker.cmdSticker(sock, msg, jid),
    s: () => sticker.cmdSticker(sock, msg, jid),
    toimg: () => sticker.cmdToImg(sock, msg, jid),
    brat: () => sticker.cmdBrat(sock, msg, jid, argText),
    iqc: () => sticker.cmdIqc(sock, msg, jid, helpers),

    tiktok: () => downloader.cmdTiktok(sock, msg, jid, argText),
    tt: () => downloader.cmdTiktok(sock, msg, jid, argText),
    ig: () => downloader.cmdInstagram(sock, msg, jid, argText),
    fb: () => downloader.cmdFacebook(sock, msg, jid, argText),
    yt: () => downloader.cmdYoutube(sock, msg, jid, argText),
    ytmp3: () => downloader.cmdYoutube(sock, msg, jid, argText),
    ytmp4: () => downloader.cmdYoutube(sock, msg, jid, argText),
    pinterest: () => downloader.cmdPinterest(sock, msg, jid, argText),
    twitter: () => downloader.cmdTwitter(sock, msg, jid, argText),

    translate: () => tools.cmdTranslate(sock, msg, jid, argText),
    tts: () => tools.cmdTts(sock, msg, jid, argText),
    ss: () => tools.cmdScreenshot(sock, msg, jid, argText),
    shortlink: () => tools.cmdShortlink(sock, msg, jid, argText),

    kick: () => group.cmdKick(sock, msg, jid, senderJid),
    add: () => group.cmdAdd(sock, msg, jid, senderJid, argText),
    promote: () => group.cmdPromote(sock, msg, jid, senderJid),
    demote: () => group.cmdDemote(sock, msg, jid, senderJid),
    hidetag: () => group.cmdHidetag(sock, msg, jid, senderJid, argText),
    antilink: () => group.cmdAntilink(sock, msg, jid, senderJid, argText),
    welcome: () => group.cmdWelcome(sock, msg, jid, senderJid, argText),
    groupopen: () => group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'open'),
    groupclose: () => group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'close'),
  };

  const run = commands[cmd];
  if (!run) return; // perintah tidak dikenal, diamkan saja

  await react(sock, jid, msg, '⌛');
  try {
    await run();
    await react(sock, jid, msg, '✅');
  } catch (err) {
    console.error('Command error:', err);
    await react(sock, jid, msg, '❌');
    await sock.sendMessage(jid, { text: '❌ Terjadi error saat menjalankan perintah: ' + err.message }, { quoted: msg });
  }
}

module.exports = { handleMessage };
