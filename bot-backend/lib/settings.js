const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'settings.json');
const DEFAULT = { enabled: true, runMode: 'both' }; // runMode: 'both' | 'group' | 'dm'

function getSettings() {
  try {
    if (!fs.existsSync(FILE)) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) };
  } catch {
    return { ...DEFAULT };
  }
}

function setSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(updated, null, 2));
  return updated;
}

module.exports = { getSettings, setSettings };
