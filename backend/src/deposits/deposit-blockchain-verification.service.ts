import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ConfigureDepositBlockchainVerificationDto } from './dto/deposit-blockchain.dto';

const BSC_MAINNET_CHAIN_ID = 56;
const DEFAULT_BSC_RPC_URL = 'https://bsc-dataseed.bnbchain.org';
const DEFAULT_RPC_TIMEOUT_MS = 8_000;
const ERC20_DECIMALS_SELECTOR = '0x313ce567';
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export type DepositBlockchainVerificationStatus =
  'PENDING' | 'VERIFIED' | 'FAILED' | 'UNAVAILABLE';

type VerificationMode = 'OFF' | 'VERIFY_ONLY';

interface RailBlockchainConfigRow {
  paymentRailId: string;
  verificationMode: VerificationMode;
  chainId: number | null;
  tokenContractAddress: string | null;
  tokenDecimals: number | null;
  requiredConfirmations: number;
  revision: number;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DepositVerificationRow {
  depositId: string;
  status: DepositBlockchainVerificationStatus;
  provider: string;
  chainId: number | null;
  tokenContractAddress: string | null;
  tokenDecimals: number | null;
  requiredConfirmations: number | null;
  observedConfirmations: number | null;
  blockNumber: string | null;
  onChainAmount: string | null;
  receivingAddress: string | null;
  txid: string | null;
  failureCode: string | null;
  failureReason: string | null;
  attemptCount: number;
  checkedAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DepositCandidateRow {
  depositId: string;
  amount: string;
  currency: string;
  txid: string | null;
  assignedWalletAddress: string;
  assignedNetwork: string;
  assignedValidationProfile: string;
  paymentRailId: string;
  railNetworkCode: string;
  railValidationProfile: string;
  verificationMode: VerificationMode | null;
  chainId: number | null;
  tokenContractAddress: string | null;
  tokenDecimals: number | null;
  requiredConfirmations: number | null;
}

interface RpcEnvelope {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
}

interface EvmReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

interface EvmReceipt {
  status: string;
  blockNumber: string;
  logs: EvmReceiptLog[];
}

interface VerificationResult {
  status: DepositBlockchainVerificationStatus;
  observedConfirmations: number | null;
  blockNumber: string | null;
  onChainAmount: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

class RpcUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcUnavailableError';
  }
}

export function decimalToBaseUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error('Invalid decimal amount.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('Invalid token decimals.');
  }

  const whole = match[1];
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    const unsupported = fraction.slice(decimals);
    if (/[1-9]/.test(unsupported)) {
      throw new Error('Amount has more precision than the token supports.');
    }
  }

  const retainedFraction = fraction.slice(0, decimals).padEnd(decimals, '0');
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt(retainedFraction || '0');
}

export function baseUnitsToDecimal(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('Invalid token decimals.');
  }
  if (decimals === 0) return value.toString();

  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const remainder = value % scale;
  const fraction = remainder
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function sumMatchingErc20Transfers(
  logs: EvmReceiptLog[],
  tokenContractAddress: string,
  receivingAddress: string,
): bigint {
  const contract = normalizeEvmAddress(tokenContractAddress);
  const receiver = normalizeEvmAddress(receivingAddress);
  let total = 0n;

  for (const log of logs) {
    if (normalizeEvmAddress(log.address) !== contract) continue;
    if (log.topics.length < 3) continue;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;

    const receiverTopic = log.topics[2];
    if (!/^0x[0-9a-fA-F]{64}$/.test(receiverTopic)) continue;
    const topicReceiver = `0x${receiverTopic.slice(-40)}`.toLowerCase();
    if (topicReceiver !== receiver) continue;
    if (!/^0x[0-9a-fA-F]+$/.test(log.data)) continue;

    total += BigInt(log.data);
  }

  return total;
}

function normalizeEvmAddress(value: string): string {
  return value.trim().toLowerCase();
}

function parseHexQuantity(value: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new RpcUnavailableError(
      'Blockchain RPC returned an invalid quantity.',
    );
  }
  return BigInt(value);
}

function isReceipt(value: unknown): value is EvmReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.status !== 'string') return false;
  if (typeof receipt.blockNumber !== 'string') return false;
  if (!Array.isArray(receipt.logs)) return false;

  return receipt.logs.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const log = entry as Record<string, unknown>;
    return (
      typeof log.address === 'string' &&
      Array.isArray(log.topics) &&
      log.topics.every((topic) => typeof topic === 'string') &&
      typeof log.data === 'string'
    );
  });
}

@Injectable()
export class DepositBlockchainVerificationService {
  private readonly logger = new Logger(
    DepositBlockchainVerificationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getRailConfig(paymentRailId: string) {
    const rail = await this.prisma.depositPaymentRail.findUnique({
      where: { id: paymentRailId },
      select: {
        id: true,
        asset: true,
        networkCode: true,
        displayName: true,
        validationProfile: true,
        isActive: true,
      },
    });
    if (!rail) {
      throw new NotFoundException('Deposit payment rail was not found.');
    }

    const config = await this.loadRailConfig(paymentRailId);
    return {
      rail,
      blockchainVerification: config
        ? this.configSnapshot(config)
        : {
            enabled: false,
            verificationMode: 'OFF' as const,
            chainId: null,
            tokenContractAddress: null,
            tokenDecimals: null,
            requiredConfirmations: null,
            revision: null,
            updatedByUserId: null,
            createdAt: null,
            updatedAt: null,
          },
    };
  }

  async configureRail(
    paymentRailId: string,
    dto: ConfigureDepositBlockchainVerificationDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const rail = await this.prisma.depositPaymentRail.findUnique({
      where: { id: paymentRailId },
      select: {
        id: true,
        asset: true,
        networkCode: true,
        displayName: true,
        validationProfile: true,
      },
    });
    if (!rail) {
      throw new NotFoundException('Deposit payment rail was not found.');
    }

    if (dto.enabled) {
      if (rail.validationProfile !== 'EVM') {
        throw new BadRequestException(
          'Phase 1 blockchain verification supports EVM payment rails only.',
        );
      }
      if (dto.chainId !== BSC_MAINNET_CHAIN_ID) {
        throw new BadRequestException(
          'Phase 1 blockchain verification supports BNB Smart Chain mainnet (chain ID 56) only.',
        );
      }

      await this.assertRpcAndTokenConfig(dto);
    }

    const before = await this.loadRailConfig(paymentRailId);
    const verificationMode: VerificationMode = dto.enabled
      ? 'VERIFY_ONLY'
      : 'OFF';

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO deposit_payment_rail_blockchain_configs (
            paymentRailId,
            verificationMode,
            chainId,
            tokenContractAddress,
            tokenDecimals,
            requiredConfirmations,
            revision,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${paymentRailId},
            ${verificationMode},
            ${dto.chainId},
            ${normalizeEvmAddress(dto.tokenContractAddress)},
            ${dto.tokenDecimals},
            ${dto.requiredConfirmations},
            1,
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            verificationMode = VALUES(verificationMode),
            chainId = VALUES(chainId),
            tokenContractAddress = VALUES(tokenContractAddress),
            tokenDecimals = VALUES(tokenDecimals),
            requiredConfirmations = VALUES(requiredConfirmations),
            revision = revision + 1,
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = CURRENT_TIMESTAMP(3)
        `);

        const afterRows = await transaction.$queryRaw<
          RailBlockchainConfigRow[]
        >(
          Prisma.sql`
            SELECT
              paymentRailId,
              verificationMode,
              chainId,
              tokenContractAddress,
              tokenDecimals,
              requiredConfirmations,
              revision,
              updatedByUserId,
              createdAt,
              updatedAt
            FROM deposit_payment_rail_blockchain_configs
            WHERE paymentRailId = ${paymentRailId}
            LIMIT 1
          `,
        );
        const after = afterRows[0];
        if (!after) {
          throw new ServiceUnavailableException(
            'Blockchain verification configuration could not be read back.',
          );
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: before ? 'UPDATE' : 'CREATE',
            entityType: 'DepositPaymentRailBlockchainConfig',
            entityId: paymentRailId,
            description: `Administrator ${dto.enabled ? 'enabled' : 'disabled'} blockchain verification for ${rail.asset}/${rail.networkCode}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_BLOCKCHAIN_CONFIG',
              operation: 'CONFIGURE_DEPOSIT_BLOCKCHAIN_VERIFICATION',
              reason: dto.reason,
              before: before ? this.configSnapshot(before) : null,
              after: this.configSnapshot(after),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return this.getRailConfig(paymentRailId);
  }

  async getDepositVerification(depositId: string) {
    const candidate = await this.loadDepositCandidate(depositId);
    if (!candidate) {
      throw new NotFoundException('Deposit was not found.');
    }

    const verification = await this.loadVerification(depositId);
    return {
      depositId,
      required: candidate.verificationMode === 'VERIFY_ONLY',
      paymentRailId: candidate.paymentRailId,
      network: candidate.assignedNetwork,
      verification,
    };
  }

  async verifyDeposit(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const candidate = await this.loadDepositCandidate(depositId);
    if (!candidate) {
      throw new NotFoundException('Deposit was not found.');
    }

    this.assertCandidateConfigured(candidate);

    const existing = await this.loadVerification(depositId);
    if (existing?.status === 'VERIFIED') {
      return {
        message: 'Deposit blockchain transaction was already verified.',
        alreadyVerified: true,
        verification: existing,
      };
    }

    const result = await this.performVerification(candidate);
    const verification = await this.persistVerification(
      candidate,
      result,
      actor,
      context,
    );

    return {
      message: this.verificationMessage(result.status),
      alreadyVerified: false,
      verification,
    };
  }

  private async assertRpcAndTokenConfig(
    dto: ConfigureDepositBlockchainVerificationDto,
  ): Promise<void> {
    let chainId: number;
    let decimals: number;
    try {
      const chainHex = await this.rpc<string>('eth_chainId', []);
      chainId = Number(parseHexQuantity(chainHex));
      const decimalsHex = await this.rpc<string>('eth_call', [
        {
          to: normalizeEvmAddress(dto.tokenContractAddress),
          data: ERC20_DECIMALS_SELECTOR,
        },
        'latest',
      ]);
      decimals = Number(parseHexQuantity(decimalsHex));
    } catch (error) {
      this.logger.warn(
        `BSC blockchain configuration probe failed: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'BNB Smart Chain RPC/token contract could not be verified. Configuration was not changed.',
      );
    }

    if (chainId !== dto.chainId) {
      throw new BadRequestException(
        `Configured chain ID ${dto.chainId} does not match the RPC chain ID ${chainId}.`,
      );
    }
    if (decimals !== dto.tokenDecimals) {
      throw new BadRequestException(
        `Configured token decimals ${dto.tokenDecimals} do not match the contract decimals ${decimals}.`,
      );
    }
  }

  private async performVerification(
    candidate: DepositCandidateRow,
  ): Promise<VerificationResult> {
    const tokenDecimals = candidate.tokenDecimals as number;
    const requiredConfirmations = candidate.requiredConfirmations as number;
    const tokenContractAddress = candidate.tokenContractAddress as string;

    if (!candidate.txid) {
      return this.failed('TXID_MISSING', 'Deposit has no transaction ID.');
    }

    let expectedBaseUnits: bigint;
    try {
      expectedBaseUnits = decimalToBaseUnits(candidate.amount, tokenDecimals);
    } catch {
      return this.failed(
        'EXPECTED_AMOUNT_INVALID',
        'Deposit amount cannot be represented with the configured token decimals.',
      );
    }

    try {
      const chainHex = await this.rpc<string>('eth_chainId', []);
      const observedChainId = Number(parseHexQuantity(chainHex));
      if (observedChainId !== candidate.chainId) {
        return this.unavailable(
          'CHAIN_MISMATCH',
          `RPC chain ID ${observedChainId} does not match configured chain ID ${candidate.chainId}.`,
        );
      }

      const txHash = candidate.txid.startsWith('0x')
        ? candidate.txid
        : `0x${candidate.txid}`;
      const receiptValue = await this.rpc<unknown>(
        'eth_getTransactionReceipt',
        [txHash],
      );
      if (receiptValue === null) {
        return {
          status: 'PENDING',
          observedConfirmations: null,
          blockNumber: null,
          onChainAmount: null,
          failureCode: 'TX_NOT_FOUND_OR_PENDING',
          failureReason:
            'Transaction is not mined or is not currently visible on the configured BSC RPC.',
        };
      }
      if (!isReceipt(receiptValue)) {
        throw new RpcUnavailableError(
          'Blockchain RPC returned a malformed transaction receipt.',
        );
      }

      if (parseHexQuantity(receiptValue.status) !== 1n) {
        return this.failed(
          'TX_REVERTED',
          'Blockchain transaction did not complete successfully.',
          receiptValue.blockNumber,
        );
      }

      const transferredBaseUnits = sumMatchingErc20Transfers(
        receiptValue.logs,
        tokenContractAddress,
        candidate.assignedWalletAddress,
      );
      const onChainAmount = baseUnitsToDecimal(
        transferredBaseUnits,
        tokenDecimals,
      );

      if (transferredBaseUnits === 0n) {
        return this.failed(
          'TRANSFER_NOT_FOUND',
          'No matching token Transfer event to the configured receiving address was found.',
          receiptValue.blockNumber,
          onChainAmount,
        );
      }
      if (transferredBaseUnits !== expectedBaseUnits) {
        return this.failed(
          'AMOUNT_MISMATCH',
          `On-chain amount ${onChainAmount} does not match submitted amount ${candidate.amount}.`,
          receiptValue.blockNumber,
          onChainAmount,
        );
      }

      const currentBlockHex = await this.rpc<string>('eth_blockNumber', []);
      const currentBlock = parseHexQuantity(currentBlockHex);
      const receiptBlock = parseHexQuantity(receiptValue.blockNumber);
      if (currentBlock < receiptBlock) {
        throw new RpcUnavailableError(
          'Blockchain RPC returned an inconsistent current block.',
        );
      }

      const confirmationsBigInt = currentBlock - receiptBlock + 1n;
      const confirmations = Number(confirmationsBigInt);
      if (!Number.isSafeInteger(confirmations)) {
        throw new RpcUnavailableError(
          'Blockchain confirmation count exceeded the supported range.',
        );
      }

      if (confirmations < requiredConfirmations) {
        return {
          status: 'PENDING',
          observedConfirmations: confirmations,
          blockNumber: receiptBlock.toString(),
          onChainAmount,
          failureCode: 'CONFIRMATIONS_PENDING',
          failureReason: `${confirmations}/${requiredConfirmations} required confirmations observed.`,
        };
      }

      return {
        status: 'VERIFIED',
        observedConfirmations: confirmations,
        blockNumber: receiptBlock.toString(),
        onChainAmount,
        failureCode: null,
        failureReason: null,
      };
    } catch (error) {
      this.logger.warn(
        `BSC verification unavailable for deposit ${candidate.depositId}: ${this.errorMessage(error)}`,
      );
      return this.unavailable(
        'RPC_UNAVAILABLE',
        'BNB Smart Chain verification service is temporarily unavailable. Retry without approving the deposit.',
      );
    }
  }

  private assertCandidateConfigured(candidate: DepositCandidateRow): void {
    if (candidate.verificationMode !== 'VERIFY_ONLY') {
      throw new BadRequestException(
        'Blockchain verification is not enabled for this deposit payment rail.',
      );
    }
    if (
      candidate.chainId === null ||
      candidate.tokenContractAddress === null ||
      candidate.tokenDecimals === null ||
      candidate.requiredConfirmations === null
    ) {
      throw new ServiceUnavailableException(
        'Blockchain verification configuration is incomplete for this payment rail.',
      );
    }
    if (
      candidate.assignedValidationProfile !== 'EVM' ||
      candidate.railValidationProfile !== 'EVM'
    ) {
      throw new BadRequestException(
        'Blockchain verification is configured only for EVM deposits in phase 1.',
      );
    }
    if (candidate.chainId !== BSC_MAINNET_CHAIN_ID) {
      throw new BadRequestException(
        'Phase 1 blockchain verification supports BNB Smart Chain mainnet only.',
      );
    }
  }

  private async persistVerification(
    candidate: DepositCandidateRow,
    result: VerificationResult,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<DepositVerificationRow> {
    const checkedAt = new Date();
    const verifiedAt = result.status === 'VERIFIED' ? checkedAt : null;

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO deposit_blockchain_verifications (
            depositId,
            status,
            provider,
            chainId,
            tokenContractAddress,
            tokenDecimals,
            requiredConfirmations,
            observedConfirmations,
            blockNumber,
            onChainAmount,
            receivingAddress,
            txid,
            failureCode,
            failureReason,
            attemptCount,
            checkedAt,
            verifiedAt,
            createdAt,
            updatedAt
          ) VALUES (
            ${candidate.depositId},
            ${result.status},
            'BSC_JSON_RPC',
            ${candidate.chainId},
            ${candidate.tokenContractAddress},
            ${candidate.tokenDecimals},
            ${candidate.requiredConfirmations},
            ${result.observedConfirmations},
            ${result.blockNumber ? BigInt(result.blockNumber) : null},
            ${result.onChainAmount},
            ${normalizeEvmAddress(candidate.assignedWalletAddress)},
            ${candidate.txid},
            ${result.failureCode},
            ${result.failureReason},
            1,
            ${checkedAt},
            ${verifiedAt},
            ${checkedAt},
            ${checkedAt}
          )
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            provider = VALUES(provider),
            chainId = VALUES(chainId),
            tokenContractAddress = VALUES(tokenContractAddress),
            tokenDecimals = VALUES(tokenDecimals),
            requiredConfirmations = VALUES(requiredConfirmations),
            observedConfirmations = VALUES(observedConfirmations),
            blockNumber = VALUES(blockNumber),
            onChainAmount = VALUES(onChainAmount),
            receivingAddress = VALUES(receivingAddress),
            txid = VALUES(txid),
            failureCode = VALUES(failureCode),
            failureReason = VALUES(failureReason),
            attemptCount = attemptCount + 1,
            checkedAt = VALUES(checkedAt),
            verifiedAt = VALUES(verifiedAt),
            updatedAt = VALUES(updatedAt)
        `);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'DepositBlockchainVerification',
            entityId: candidate.depositId,
            description: `Administrator checked deposit blockchain verification: ${result.status}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_BLOCKCHAIN_VERIFY',
              operation: 'VERIFY_DEPOSIT_BLOCKCHAIN_TRANSACTION',
              status: result.status,
              chainId: candidate.chainId,
              tokenContractAddress: candidate.tokenContractAddress,
              tokenDecimals: candidate.tokenDecimals,
              requiredConfirmations: candidate.requiredConfirmations,
              observedConfirmations: result.observedConfirmations,
              blockNumber: result.blockNumber,
              onChainAmount: result.onChainAmount,
              receivingAddress: normalizeEvmAddress(
                candidate.assignedWalletAddress,
              ),
              txid: candidate.txid,
              failureCode: result.failureCode,
              failureReason: result.failureReason,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        const rows = await transaction.$queryRaw<DepositVerificationRow[]>(
          Prisma.sql`
            SELECT
              depositId,
              status,
              provider,
              chainId,
              tokenContractAddress,
              tokenDecimals,
              requiredConfirmations,
              observedConfirmations,
              CAST(blockNumber AS CHAR) AS blockNumber,
              onChainAmount,
              receivingAddress,
              txid,
              failureCode,
              failureReason,
              attemptCount,
              checkedAt,
              verifiedAt,
              createdAt,
              updatedAt
            FROM deposit_blockchain_verifications
            WHERE depositId = ${candidate.depositId}
            LIMIT 1
          `,
        );
        const verification = rows[0];
        if (!verification) {
          throw new ServiceUnavailableException(
            'Blockchain verification result could not be read back.',
          );
        }
        return verification;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async loadRailConfig(
    paymentRailId: string,
  ): Promise<RailBlockchainConfigRow | null> {
    const rows = await this.prisma.$queryRaw<
      RailBlockchainConfigRow[]
    >(Prisma.sql`
      SELECT
        paymentRailId,
        verificationMode,
        chainId,
        tokenContractAddress,
        tokenDecimals,
        requiredConfirmations,
        revision,
        updatedByUserId,
        createdAt,
        updatedAt
      FROM deposit_payment_rail_blockchain_configs
      WHERE paymentRailId = ${paymentRailId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async loadDepositCandidate(
    depositId: string,
  ): Promise<DepositCandidateRow | null> {
    const rows = await this.prisma.$queryRaw<DepositCandidateRow[]>(Prisma.sql`
      SELECT
        d.id AS depositId,
        CAST(d.amount AS CHAR) AS amount,
        d.currency AS currency,
        d.txid AS txid,
        d.assignedWalletAddress AS assignedWalletAddress,
        d.assignedNetwork AS assignedNetwork,
        d.assignedValidationProfile AS assignedValidationProfile,
        da.paymentRailId AS paymentRailId,
        dpr.networkCode AS railNetworkCode,
        dpr.validationProfile AS railValidationProfile,
        cfg.verificationMode AS verificationMode,
        cfg.chainId AS chainId,
        cfg.tokenContractAddress AS tokenContractAddress,
        cfg.tokenDecimals AS tokenDecimals,
        cfg.requiredConfirmations AS requiredConfirmations
      FROM deposits d
      INNER JOIN deposit_accounts da
        ON da.id = d.assignedDepositAccountId
      INNER JOIN deposit_payment_rails dpr
        ON dpr.id = da.paymentRailId
      LEFT JOIN deposit_payment_rail_blockchain_configs cfg
        ON cfg.paymentRailId = dpr.id
      WHERE d.id = ${depositId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async loadVerification(
    depositId: string,
  ): Promise<DepositVerificationRow | null> {
    const rows = await this.prisma.$queryRaw<
      DepositVerificationRow[]
    >(Prisma.sql`
      SELECT
        depositId,
        status,
        provider,
        chainId,
        tokenContractAddress,
        tokenDecimals,
        requiredConfirmations,
        observedConfirmations,
        CAST(blockNumber AS CHAR) AS blockNumber,
        onChainAmount,
        receivingAddress,
        txid,
        failureCode,
        failureReason,
        attemptCount,
        checkedAt,
        verifiedAt,
        createdAt,
        updatedAt
      FROM deposit_blockchain_verifications
      WHERE depositId = ${depositId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const rpcUrl =
      this.config.get<string>('DEPOSIT_BSC_RPC_URL')?.trim() ||
      DEFAULT_BSC_RPC_URL;
    const configuredTimeout = Number(
      this.config.get<string>('DEPOSIT_BSC_RPC_TIMEOUT_MS') ??
        DEFAULT_RPC_TIMEOUT_MS,
    );
    const timeoutMs =
      Number.isFinite(configuredTimeout) &&
      configuredTimeout >= 1_000 &&
      configuredTimeout <= 30_000
        ? configuredTimeout
        : DEFAULT_RPC_TIMEOUT_MS;

    let response: Response;
    try {
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RpcUnavailableError(
        `RPC request failed: ${this.errorMessage(error)}`,
      );
    }

    if (!response.ok) {
      throw new RpcUnavailableError(`RPC returned HTTP ${response.status}.`);
    }

    let envelope: RpcEnvelope;
    try {
      envelope = (await response.json()) as RpcEnvelope;
    } catch {
      throw new RpcUnavailableError('RPC returned invalid JSON.');
    }

    if (envelope.error) {
      throw new RpcUnavailableError(
        `RPC error ${envelope.error.code ?? 'unknown'}: ${envelope.error.message ?? 'unknown error'}`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(envelope, 'result')) {
      throw new RpcUnavailableError('RPC response did not contain a result.');
    }

    return envelope.result as T;
  }

  private configSnapshot(config: RailBlockchainConfigRow) {
    return {
      enabled: config.verificationMode === 'VERIFY_ONLY',
      verificationMode: config.verificationMode,
      chainId: config.chainId,
      tokenContractAddress: config.tokenContractAddress,
      tokenDecimals: config.tokenDecimals,
      requiredConfirmations: config.requiredConfirmations,
      revision: config.revision,
      updatedByUserId: config.updatedByUserId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private failed(
    failureCode: string,
    failureReason: string,
    blockNumber: string | null = null,
    onChainAmount: string | null = null,
  ): VerificationResult {
    return {
      status: 'FAILED',
      observedConfirmations: null,
      blockNumber: blockNumber
        ? parseHexQuantity(blockNumber).toString()
        : null,
      onChainAmount,
      failureCode,
      failureReason,
    };
  }

  private unavailable(
    failureCode: string,
    failureReason: string,
  ): VerificationResult {
    return {
      status: 'UNAVAILABLE',
      observedConfirmations: null,
      blockNumber: null,
      onChainAmount: null,
      failureCode,
      failureReason,
    };
  }

  private verificationMessage(
    status: DepositBlockchainVerificationStatus,
  ): string {
    switch (status) {
      case 'VERIFIED':
        return 'Blockchain transaction verified. Manual deposit approval is still required.';
      case 'PENDING':
        return 'Blockchain transaction is not ready for verification yet. Retry before approval.';
      case 'FAILED':
        return 'Blockchain verification failed. Do not approve this deposit.';
      case 'UNAVAILABLE':
        return 'Blockchain verification is temporarily unavailable. Retry before approval.';
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
