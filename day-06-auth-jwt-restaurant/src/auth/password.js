import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;

/**
 * Hashes a plaintext password using scrypt with a unique 16-byte random salt.
 * Format: "<saltHex>:<derivedKeyHex>"
 */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored "<saltHex>:<derivedKeyHex>" hash
 * using constant-time comparison to prevent timing side channels.
 */
export async function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expectedKey = Buffer.from(keyHex, 'hex');
  const actualKey = await scrypt(password, salt, KEY_LENGTH);

  if (expectedKey.length !== actualKey.length) return false;
  return timingSafeEqual(expectedKey, actualKey);
}
