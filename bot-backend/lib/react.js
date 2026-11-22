// Kasih reaksi emoji ke sebuah pesan (gagal diam-diam kalau nggak bisa)
async function react(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });
  } catch (e) {
    // abaikan
  }
}
module.exports = { react };
