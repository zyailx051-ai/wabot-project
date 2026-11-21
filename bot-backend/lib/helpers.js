const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// Buka pembungkus pesan (mis. grup dengan pesan sementara) supaya isinya terbaca
function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 5 && cur; i++) {
    const inner =
      cur.ephemeralMessage?.message ||
      cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function getText(msg) {
  const m = unwrap(msg.message);
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
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
  // Cek media di pesan langsung dulu
  const directTypes = ['imageMessage', 'videoMessage', 'stickerMessage'];
  for (const type of directTypes) {
    if (msg.message?.[type]) {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      return { buffer, type };
    }
  }
  // Cek media di pesan yang di-reply (quoted)
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
  
