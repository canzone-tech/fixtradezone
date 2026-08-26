import { createHash } from 'node:crypto';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import type { DepositNetwork } from './deposits.constants';

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

function isEvmNetwork(network: DepositNetwork): boolean {
  return [
    'ERC20',
    'BEP20',
    'POLYGON',
    'ARBITRUM',
    'BASE',
    'OPTIMISM',
  ].includes(network);
}

export function isValidDepositAddress(
  network: DepositNetwork,
  value: string,
): boolean {
  if (network === 'TRC20') {
    return isValidTronAddress(value);
  }

  if (isEvmNetwork(network)) {
    return EVM_ADDRESS_PATTERN.test(value);
  }

  if (network === 'SOLANA') {
    return SOLANA_ADDRESS_PATTERN.test(value);
  }

  return false;
}

export function normalizeDepositTransactionId(
  network: DepositNetwork,
  value: string,
): string | null {
  const trimmed = value.trim();

  if (network === 'TRC20') {
    return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
  }

  if (isEvmNetwork(network)) {
    if (!HEX_TXID_PATTERN.test(trimmed)) return null;
    return trimmed.toLowerCase().replace(/^0x/, '');
  }

  if (network === 'SOLANA') {
    return SOLANA_SIGNATURE_PATTERN.test(trimmed) ? trimmed : null;
  }

  return null;
}

export function IsValidDepositAddress(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidDepositAddress',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;

          const candidate = args.object as { network?: unknown };
          if (typeof candidate.network !== 'string') return false;

          return isValidDepositAddress(
            candidate.network as DepositNetwork,
            value,
          );
        },
        defaultMessage(args: ValidationArguments) {
          const candidate = args.object as { network?: unknown };
          const network =
            typeof candidate.network === 'string'
              ? candidate.network
              : 'selected network';
          return `${args.property} must be valid for ${network}.`;
        },
      },
    });
  };
}
