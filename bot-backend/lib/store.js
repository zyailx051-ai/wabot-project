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
  return data[jid] || { antilink: false, welcome: false, welcomeText: null };
}

function setGroupSetting(jid, key, value) {
  const data = load();
  if (!data[jid]) data[jid] = { antilink: false, welcome: false };
  data[jid][key] = value;
  save(data);
}

// Hitung peringatan per orang per fitur (mis. kind = 'antilink').
function addWarn(jid, kind, user) {
  const data = load();
  if (!data[jid]) data[jid] = { antilink: false, welcome: false };
  if (!data[jid].warns) data[jid].warns = {};
  const k = `${kind}:${user}`;
  data[jid].warns[k] = (data[jid].warns[k] || 0) + 1;
  save(data);
  return data[jid].warns[k];
}

function resetWarn(jid, kind, user) {
  const data = load();
  if (data[jid]?.warns) {
    delete data[jid].warns[`${kind}:${user}`];
    save(data);
  }
}

module.exports = { getGroupSettings, setGroupSetting, addWarn, resetWarn };
                       
