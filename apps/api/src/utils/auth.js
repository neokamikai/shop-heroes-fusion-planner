const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_PROVIDER = 'password';

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);

  return `scrypt:${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash ?? '').split(':');

  if (algorithm !== 'scrypt' || !salt || !expectedHex) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const actualBuffer = Buffer.from(derivedKey);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function createAccessToken(payload, secret, options = {}) {
  return jwt.sign(payload, secret, options);
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createNumericCode(length = 6) {
  return Array.from({ length }, () => crypto.randomInt(0, 10)).join('');
}

function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function verifyAccessToken(token, secret) {
  return jwt.verify(token, secret);
}

function readBearerToken(authorizationHeader = '') {
  const [scheme, token] = String(authorizationHeader).trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function isJwtError(error) {
  return error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError';
}

module.exports = {
  PASSWORD_PROVIDER,
  createAccessToken,
  createNumericCode,
  createOpaqueToken,
  hashPassword,
  hashOpaqueToken,
  isJwtError,
  normalizeEmail,
  readBearerToken,
  verifyAccessToken,
  verifyPassword
};
