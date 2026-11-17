const { downloadMediaMessage } = require('@whiskeysockets/baileys');

function getText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return {
    message: ctx.quotedMessage,
    participant: ctx.participant,
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
  };
}

async function downloadQuotedOrDirectMedia(msg) {
  const directTypes = ['imageMessage', 'videoMessage', 'stickerMessage'];
  for (const type of directTypes) {
    if (msg.message?.[type]) {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      return { buffer, type };
    }
  }
  const quoted = getQuoted(msg);
  if (quoted) {
    for (const type of directTypes) {
      if (quoted.message[type]) {
        const fakeMsg = { key: quoted.key, message: quoted.message };
        const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
        return { buffer, type };
      }
    }
  }
  return null;
}

function isGroup(jid) {
  return jid.endsWith('@g.us');
}

module.exports = { getText, getQuoted, downloadQuotedOrDirectMedia, isGroup };
