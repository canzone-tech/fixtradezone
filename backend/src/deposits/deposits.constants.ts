export const DEFAULT_DEPOSIT_ASSET = 'USDT' as const;
export const DEFAULT_DEPOSIT_NETWORK = 'TRC20' as const;

export const DEPOSIT_NETWORKS = [
  'TRC20',
  'ERC20',
  'BEP20',
  'POLYGON',
  'ARBITRUM',
  'BASE',
  'OPTIMISM',
  'SOLANA',
] as const;

export type DepositNetwork = (typeof DEPOSIT_NETWORKS)[number];

export const DEPOSIT_STATUSES = [
  'AWAITING_TXID',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;

export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const OPEN_DEPOSIT_STATUSES = [
  'AWAITING_TXID',
  'PENDING_REVIEW',
] as const;

export const DEPOSIT_AUDIT_OPERATIONS = {
  CREATE_ACCOUNT: 'CREATE_DEPOSIT_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_DEPOSIT_ACCOUNT',
  CREATE_REQUEST: 'CREATE_DEPOSIT_REQUEST',
  SUBMIT_TXID: 'SUBMIT_DEPOSIT_TXID',
  APPROVE: 'APPROVE_DEPOSIT',
  REJECT: 'REJECT_DEPOSIT',
} as const;
