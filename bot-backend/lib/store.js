const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'groupSettings.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getGroupSettings(jid) {
  const data = load();
  return data[jid] || { antilink: false, welcome: false };
}

function setGroupSetting(jid, key, value) {
  const data = load();
  if (!data[jid]) data[jid] = { antilink: false, welcome: false };
  data[jid][key] = value;
  save(data);
}

module.exports = { getGroupSettings, setGroupSetting };
