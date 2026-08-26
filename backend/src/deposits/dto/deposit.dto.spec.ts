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
const ADDRESS = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
const QR = 'data:image/png;base64,aGVsbG8=';

describe('deposit DTOs', () => {
  it('accepts a valid public TRON receiving account with QR data', async () => {
    const dto = plainToInstance(CreateDepositAccountDto, {
      label: ' Treasury A ',
      walletAddress: ADDRESS,
      qrCodeDataUrl: QR,
      isActive: true,
      reason: ' Initial receiving account ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.label).toBe('Treasury A');
    expect(dto.reason).toBe('Initial receiving account');
  });

  it('rejects a non-TRON receiving address', async () => {
    const dto = plainToInstance(CreateDepositAccountDto, {
      label: 'Treasury A',
      walletAddress: '0x1234',
      qrCodeDataUrl: QR,
      reason: 'Invalid address test',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a real account mutation in addition to audit reason', async () => {
    const dto = plainToInstance(UpdateDepositAccountDto, {
      expectedRevision: 1,
      reason: 'Reason only',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.expectedRevision).toBe(1);
  });

  it('normalizes TXID to lowercase and requires exactly 64 hex characters', async () => {
    const txid = 'A'.repeat(64);
    const dto = plainToInstance(SubmitDepositTxidDto, { txid: ` ${txid} ` });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.txid).toBe('a'.repeat(64));

    const invalid = plainToInstance(SubmitDepositTxidDto, {
      txid: 'not-a-tron-txid',
    });
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
