import { randomBytes } from 'node:crypto';

export const PUBLIC_USERNAME_LENGTH = 8;
export const PUBLIC_USERNAME_PATTERN = /^[a-z0-9]{8}$/;
export const PUBLIC_USERNAME_MAX_ATTEMPTS = 32;

const PUBLIC_USERNAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_BYTE_ACCEPTANCE_LIMIT =
  Math.floor(256 / PUBLIC_USERNAME_ALPHABET.length) *
  PUBLIC_USERNAME_ALPHABET.length;

export function createRandomPublicUsername(): string {
  let username = '';

  while (username.length < PUBLIC_USERNAME_LENGTH) {
    const bytes = randomBytes(PUBLIC_USERNAME_LENGTH * 2);

    for (const byte of bytes) {
      if (byte >= RANDOM_BYTE_ACCEPTANCE_LIMIT) continue;

      username +=
        PUBLIC_USERNAME_ALPHABET[byte % PUBLIC_USERNAME_ALPHABET.length];

      if (username.length === PUBLIC_USERNAME_LENGTH) {
        return username;
      }
    }
  }

  return username;
}
