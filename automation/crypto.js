const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function deriveKey(secret) {
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required to encrypt session data.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToBase64(plainText, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptFromBase64(payload, secret) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveEncryptedJson(targetPath, payload, secret) {
  ensureDirectory(targetPath);
  const encoded = encryptToBase64(JSON.stringify(payload), secret);
  fs.writeFileSync(targetPath, encoded, { encoding: 'utf8', mode: 0o600 });
}

function readEncryptedJson(targetPath, secret) {
  if (!fs.existsSync(targetPath)) {
    return null;
  }
  const encoded = fs.readFileSync(targetPath, 'utf8');
  const decrypted = decryptFromBase64(encoded, secret);
  return JSON.parse(decrypted);
}

module.exports = {
  decryptFromBase64,
  encryptToBase64,
  ensureDirectory,
  readEncryptedJson,
  saveEncryptedJson
};
