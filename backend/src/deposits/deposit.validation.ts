import { createHash } from 'node:crypto';
import type { DepositValidationProfile } from './deposits.constants';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_TXID_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

function sha256(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest();
}

function decodeBase58(value: string): Buffer | null {
  let numeric = 0n;

  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) return null;
    numeric = numeric * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (numeric > 0n) {
    bytes.push(Number(numeric & 0xffn));
    numeric >>= 8n;
  }
  bytes.reverse();

  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') {
    leadingZeroes += 1;
  }

  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

export function isValidTronAddress(value: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) {
    return false;
  }

  const decoded = decodeBase58(value);
  if (!decoded || decoded.length !== 25) {
    return false;
  }

  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);

  if (payload[0] !== 0x41) {
    return false;
  }

  const expectedChecksum = sha256(sha256(payload)).subarray(0, 4);
  return checksum.equals(expectedChecksum);
}

export function isValidDepositAddress(
  profile: DepositValidationProfile,
  value: string,
): boolean {
  if (profile === 'TRON') {
    return isValidTronAddress(value);
  }

  if (profile === 'EVM') {
    return EVM_ADDRESS_PATTERN.test(value);
  }

  if (profile === 'SOLANA') {
    return SOLANA_ADDRESS_PATTERN.test(value);
  }

  return false;
}

export function normalizeDepositTransactionId(
  profile: DepositValidationProfile,
  value: string,
): string | null {
  const trimmed = value.trim();

  if (profile === 'TRON') {
    return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
  }

  if (profile === 'EVM') {
    if (!HEX_TXID_PATTERN.test(trimmed)) return null;
    return trimmed.toLowerCase().replace(/^0x/, '');
  }

  if (profile === 'SOLANA') {
    return SOLANA_SIGNATURE_PATTERN.test(trimmed) ? trimmed : null;
  }

  return null;
}
