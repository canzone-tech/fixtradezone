import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateDepositAccountDto,
  CreateDepositDto,
  ReviewDepositDto,
  SubmitDepositTxidDto,
  UpdateDepositAccountDto,
} from './deposit.dto';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PACKAGE_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const TRON_ADDRESS = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
const EVM_ADDRESS = '0x1111111111111111111111111111111111111111';
const QR = 'data:image/png;base64,aGVsbG8=';

describe('deposit DTOs', () => {
  it('accepts a valid public TRON receiving account with QR data', async () => {
    const dto = plainToInstance(CreateDepositAccountDto, {
      label: ' Treasury A ',
      asset: ' usdt ',
      network: ' trc20 ',
      walletAddress: TRON_ADDRESS,
      qrCodeDataUrl: QR,
      isActive: true,
      reason: ' Initial receiving account ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.label).toBe('Treasury A');
    expect(dto.asset).toBe('USDT');
    expect(dto.network).toBe('TRC20');
    expect(dto.reason).toBe('Initial receiving account');
  });

  it('validates the wallet address against the selected network', async () => {
    const evm = plainToInstance(CreateDepositAccountDto, {
      label: 'USDC Ethereum',
      asset: 'USDC',
      network: 'ERC20',
      walletAddress: EVM_ADDRESS,
      qrCodeDataUrl: QR,
      reason: 'Network-aware address test',
    });
    await expect(validate(evm)).resolves.toHaveLength(0);

    const mismatch = plainToInstance(CreateDepositAccountDto, {
      label: 'Invalid TRON account',
      asset: 'USDT',
      network: 'TRC20',
      walletAddress: EVM_ADDRESS,
      qrCodeDataUrl: QR,
      reason: 'Network mismatch test',
    });
    expect(await validate(mismatch)).not.toHaveLength(0);
  });

  it('requires a real account mutation in addition to audit reason', async () => {
    const dto = plainToInstance(UpdateDepositAccountDto, {
      expectedRevision: 1,
      reason: 'Reason only',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.expectedRevision).toBe(1);
  });

  it('accepts a non-empty transaction identifier for network validation in service', async () => {
    const dto = plainToInstance(SubmitDepositTxidDto, {
      txid: ` ${'A'.repeat(64)} `,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.txid).toBe('A'.repeat(64));

    const invalid = plainToInstance(SubmitDepositTxidDto, { txid: '   ' });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('accepts only UUID package item identifiers', async () => {
    const valid = plainToInstance(CreateDepositDto, {
      packagePlanItemId: PACKAGE_ITEM_ID,
    });
    await expect(validate(valid)).resolves.toHaveLength(0);

    const invalid = plainToInstance(CreateDepositDto, {
      packagePlanItemId: ACCOUNT_ID.slice(0, 10),
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('requires a meaningful manual review note', async () => {
    const invalid = plainToInstance(ReviewDepositDto, { note: ' x ' });
    expect(await validate(invalid)).not.toHaveLength(0);

    const valid = plainToInstance(ReviewDepositDto, {
      note: ' TXID manually verified ',
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.note).toBe('TXID manually verified');
  });
});
