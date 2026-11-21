const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'stats.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return { totalLinked: 0 };
    return { totalLinked: 0, ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) };
  } catch {
    return { totalLinked: 0 };
  }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getStats() {
  return load();
}

// Dipanggil sekali tiap ada penautan BARU (scan QR / kode tautan) yang berhasil.
function incrementLinked() {
  const data = load();
  data.totalLinked += 1;
  data.lastLinkedAt = Date.now();
  save(data);
  return data;
}

module.exports = { getStats, incrementLinked };
