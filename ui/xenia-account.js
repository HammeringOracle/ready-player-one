// Xenia offline-account file support.
// File layout and cryptographic compatibility are derived from Xenia Manager
// (BSD-3-Clause, Copyright (c) 2025 shazzaam7). See xenia-account-LICENSE.md.
const crypto = require('node:crypto');

const RETAIL_KEY = Buffer.from('e1bc159c73b1eae9ab3170f3ad47ebf3', 'hex');
const ACCOUNT_DATA_LENGTH = 380;
const CONFOUNDER_LENGTH = 8;
const HMAC_LENGTH = 16;

function hmacSha1(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest().subarray(0, HMAC_LENGTH);
}

function rc4(key, input) {
  const state = Buffer.from(Array.from({length: 256}, (_, index) => index));
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }
  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;
  for (let offset = 0; offset < input.length; offset += 1) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    output[offset] = input[offset] ^ state[(state[i] + state[j]) & 0xff];
  }
  return output;
}

function encodeUtf16Be(value, byteLength) {
  const littleEndian = Buffer.from(String(value), 'utf16le');
  const result = Buffer.alloc(byteLength);
  const copyLength = Math.min(littleEndian.length, byteLength);
  for (let index = 0; index + 1 < copyLength; index += 2) {
    result[index] = littleEndian[index + 1];
    result[index + 1] = littleEndian[index];
  }
  return result;
}

function decodeUtf16Be(value) {
  const littleEndian = Buffer.alloc(value.length);
  for (let index = 0; index + 1 < value.length; index += 2) {
    littleEndian[index] = value[index + 1];
    littleEndian[index + 1] = value[index];
  }
  return littleEndian.toString('utf16le').replace(/\0.*$/s, '');
}

function generateOfflineXuid(randomBytes = crypto.randomBytes) {
  const random = BigInt(randomBytes(4).readUInt32LE(0) & 0x7fffffff);
  return (0xE03n << 52n) | random;
}

function formatXuid(xuid) {
  return BigInt(xuid).toString(16).toUpperCase().padStart(16, '0');
}

function createOfflineAccount(gamertag, options = {}) {
  const normalized = String(gamertag || '').trim();
  if (!normalized || normalized.length > 15 || /[\x00-\x1f<>\\"|]/.test(normalized)) {
    throw new Error('GamerTags must be 1–15 characters and cannot contain control characters, <, >, backslash, quotation marks, or |.');
  }
  const xuid = options.xuid ?? generateOfflineXuid(options.randomBytes);
  const data = Buffer.alloc(ACCOUNT_DATA_LENGTH);
  encodeUtf16Be(normalized, 32).copy(data, 0x08);
  // The XUID stored inside an offline Account is zero. The generated XUID is
  // the directory identity used by Xenia.
  data.writeBigUInt64BE(0n, 0x28);
  const confounder = options.confounder ? Buffer.from(options.confounder) : crypto.randomBytes(CONFOUNDER_LENGTH);
  if (confounder.length !== CONFOUNDER_LENGTH) throw new Error('Xenia account confounder must be 8 bytes.');
  const payload = Buffer.concat([confounder, data]);
  const hmac = hmacSha1(RETAIL_KEY, payload);
  const encrypted = rc4(hmacSha1(RETAIL_KEY, hmac), payload);
  return {gamertag: normalized, xuid: formatXuid(xuid), account: Buffer.concat([hmac, encrypted])};
}

function readOfflineAccount(account) {
  const file = Buffer.from(account);
  if (file.length !== HMAC_LENGTH + CONFOUNDER_LENGTH + ACCOUNT_DATA_LENGTH) throw new Error('Invalid Xenia Account file length.');
  const hmac = file.subarray(0, HMAC_LENGTH);
  const payload = rc4(hmacSha1(RETAIL_KEY, hmac), file.subarray(HMAC_LENGTH));
  const expected = hmacSha1(RETAIL_KEY, payload);
  if (!crypto.timingSafeEqual(hmac, expected)) throw new Error('Invalid Xenia Account authentication code.');
  const data = payload.subarray(CONFOUNDER_LENGTH);
  return {gamertag: decodeUtf16Be(data.subarray(0x08, 0x28)), onlineXuid: data.readBigUInt64BE(0x28)};
}

module.exports = {createOfflineAccount, readOfflineAccount, generateOfflineXuid, formatXuid};
