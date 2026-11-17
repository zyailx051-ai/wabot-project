const helpers = require('./helpers');
const menu = require('../commands/menu');
const sticker = require('../commands/sticker');
const downloader = require('../commands/downloader');
const tools = require('../commands/tools');
const group = require('../commands/group');

const PREFIX = process.env.BOT_PREFIX || '.';

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const text = helpers.getText(msg).trim();
  const pushName = msg.pushName || 'User';

  if (await group.checkAntilink(sock, msg, jid, senderJid, text)) return;

  if (!text.startsWith(PREFIX)) return;

  const body = text.slice(PREFIX.length).trim();
  const [cmdRaw, ...args] = body.split(' ');
  const cmd = cmdRaw.toLowerCase();
  const argText = args.join(' ');

  try {
    switch (cmd) {
      case 'menu':
        return sock.sendMessage(jid, { text: menu.mainMenu(pushName) }, { quoted: msg });
      case 'menusticker':
        return sock.sendMessage(jid, { text: menu.stickerMenu() }, { quoted: msg });
      case 'menudownload':
        return sock.sendMessage(jid, { text: menu.downloadMenu() }, { quoted: msg });
      case 'menutools':
        return sock.sendMessage(jid, { text: menu.toolsMenu() }, { quoted: msg });
      case 'menugroup':
        return sock.sendMessage(jid, { text: menu.groupMenu() }, { quoted: msg });

      case 'sticker':
      case 's':
        return sticker.cmdSticker(sock, msg, jid);
      case 'toimg':
        return sticker.cmdToImg(sock, msg, jid);
      case 'brat':
        return sticker.cmdBrat(sock, msg, jid, argText);
      case 'iqc':
        return sticker.cmdIqc(sock, msg, jid, helpers);

      case 'tiktok':
      case 'tt':
        return downloader.cmdTiktok(sock, msg, jid, argText);
      case 'ig':
        return downloader.cmdInstagram(sock, msg, jid, argText);
      case 'fb':
        return downloader.cmdFacebook(sock, msg, jid, argText);
      case 'yt':
      case 'ytmp3':
      case 'ytmp4':
        return downloader.cmdYoutube(sock, msg, jid, argText);
      case 'pinterest':
        return downloader.cmdPinterest(sock, msg, jid, argText);
      case 'twitter':
        return downloader.cmdTwitter(sock, msg, jid, argText);

      case 'translate':
        return tools.cmdTranslate(sock, msg, jid, argText);
      case 'tts':
        return tools.cmdTts(sock, msg, jid, argText);
      case 'ss':
        return tools.cmdScreenshot(sock, msg, jid, argText);
      case 'shortlink':
        return tools.cmdShortlink(sock, msg, jid, argText);

      case 'kick':
        return group.cmdKick(sock, msg, jid, senderJid);
      case 'add':
        return group.cmdAdd(sock, msg, jid, senderJid, argText);
      case 'promote':
        return group.cmdPromote(sock, msg, jid, senderJid);
      case 'demote':
        return group.cmdDemote(sock, msg, jid, senderJid);
      case 'hidetag':
        return group.cmdHidetag(sock, msg, jid, senderJid, argText);
      case 'antilink':
        return group.cmdAntilink(sock, msg, jid, senderJid, argText);
      case 'welcome':
        return group.cmdWelcome(sock, msg, jid, senderJid, argText);
      case 'groupopen':
        return group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'open');
      case 'groupclose':
        return group.cmdGroupOpenClose(sock, msg, jid, senderJid, 'close');

      default:
        return;
    }
  } catch (err) {
    console.error('Command error:', err);
    await sock.sendMessage(jid, { text: '❌ Terjadi error saat menjalankan perintah: ' + err.message }, { quoted: msg });
  }
}

module.exports = { handleMessage };
