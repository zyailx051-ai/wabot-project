const axios = require('axios');

// Semua panggilan ke API Nexa lewat sini.
// Firewall Nexa (Imunify360) sering memblokir IP server hosting seperti Railway dengan HTTP 403.
// Kalau itu terjadi dan NEXA_RELAY_URL diisi, permintaan dialihkan lewat relay (mis. Vercel milik sendiri).
const BASE = (process.env.NEXA_BASE_URL || process.env.NEXA_BASE || 'https://api.nexadev.my.id').replace(/\/$/, '');
const RELAY = (process.env.NEXA_RELAY_URL || '').replace(/\/$/, '');
const RELAY_KEY = process.env.NEXA_RELAY_KEY || '';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const HEADERS = { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8', Referer: BASE + '/' };

let blockedUntil = 0;

function isBlocked(res) {
  if (res.status !== 403 && res.status !== 429) return false;
  const body = Buffer.from(res.data || '').toString('utf8').slice(0, 500);
  return /imunify|bot-protection|automation|blocked|forbidden/i.test(body) || res.status === 403;
}

// Return: response axios (data = Buffer). Lempar Error {blocked:true} kalau IP diblokir & relay nggak ada/gagal.
async function nexaGet(pathOrUrl, params, { timeout = 60000, maxBytes = 40 * 1024 * 1024 } = {}) {
  const base = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : BASE + pathOrUrl;
  const url = base + (params ? (base.includes('?') ? '&' : '?') + new URLSearchParams(params).toString() : '');

  const direct = () => axios.get(url, { responseType: 'arraybuffer', timeout, maxContentLength: maxBytes, headers: HEADERS, validateStatus: () => true, maxRedirects: 5 });
  const viaRelay = () =>
    axios.get(RELAY, { params: { key: RELAY_KEY, url }, responseType: 'arraybuffer', timeout: timeout + 15000, maxContentLength: maxBytes, validateStatus: () => true });

  if (RELAY && Date.now() < blockedUntil) {
    const r = await viaRelay();
    if (r.status < 400) return r;
  }
  const res = await direct();
  if (isBlocked(res)) {
    blockedUntil = Date.now() + 10 * 60 * 1000;
    if (RELAY) {
      const r = await viaRelay();
      if (r.status < 400) return r;
    }
    const err = new Error('IP server bot diblokir firewall API Nexa (Imunify360)');
    err.blocked = true;
    throw err;
  }
  return res;
}

function parseJson(res) {
  try {
    return JSON.parse(Buffer.from(res.data).toString('utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = { nexaGet, parseJson, BASE };
  
