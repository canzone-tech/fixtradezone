import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  isValidDepositAddress,
  normalizeDepositTransactionId,
} from '../deposit.validation';
import {
  CreateDepositAccountDto,
  CreateDepositDto,
  CreateDepositPaymentRailDto,
  ReviewDepositDto,
  SubmitDepositTxidDto,
  UpdateDepositAccountDto,
} from './deposit.dto';

const PAYMENT_RAIL_ID = '11111111-1111-4111-8111-111111111111';
const PACKAGE_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const TRON_ADDRESS = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
const EVM_ADDRESS = '0x1111111111111111111111111111111111111111';
const SOLANA_ADDRESS = '11111111111111111111111111111111';
const QR = 'data:image/png;base64,aGVsbG8=';

describe('deposit DTOs and validation profiles', () => {
  it('normalizes and accepts a configured payment rail', async () => {
    const dto = plainToInstance(CreateDepositPaymentRailDto, {
      asset: ' usdt ',
      networkCode: ' trc20 ',
      displayName: ' USDT on TRON ',
      validationProfile: ' tron ',
      isActive: true,
      reason: ' Initial rail ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.asset).toBe('USDT');
    expect(dto.networkCode).toBe('TRC20');
    expect(dto.validationProfile).toBe('TRON');
    expect(dto.displayName).toBe('USDT on TRON');
  });

  it('requires a payment rail UUID when creating a receiving account', async () => {
    const valid = plainToInstance(CreateDepositAccountDto, {
      label: ' Treasury A ',
      paymentRailId: PAYMENT_RAIL_ID,
      walletAddress: TRON_ADDRESS,
      qrCodeDataUrl: QR,
      isActive: true,
      reason: ' Initial receiving account ',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.label).toBe('Treasury A');

    const invalid = plainToInstance(CreateDepositAccountDto, {
      label: 'Treasury A',
      paymentRailId: 'not-a-uuid',
      walletAddress: TRON_ADDRESS,
      qrCodeDataUrl: QR,
      reason: 'Invalid rail test',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('validates addresses by protocol profile rather than network name', () => {
    expect(isValidDepositAddress('TRON', TRON_ADDRESS)).toBe(true);
    expect(isValidDepositAddress('TRON', EVM_ADDRESS)).toBe(false);
    expect(isValidDepositAddress('EVM', EVM_ADDRESS)).toBe(true);
    expect(isValidDepositAddress('SOLANA', SOLANA_ADDRESS)).toBe(true);
  });

  it('normalizes transaction identifiers by validation profile', () => {
    const hex = 'A'.repeat(64);
    expect(normalizeDepositTransactionId('TRON', hex)).toBe('a'.repeat(64));
    expect(normalizeDepositTransactionId('EVM', `0x${hex}`)).toBe(
      'a'.repeat(64),
    );
    expect(normalizeDepositTransactionId('TRON', 'not-a-txid')).toBeNull();
  });

  it('requires a real account mutation in addition to audit reason', async () => {
    const dto = plainToInstance(UpdateDepositAccountDto, {
      expectedRevision: 1,
      reason: 'Reason only',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.expectedRevision).toBe(1);
  });

  it('accepts a non-empty transaction identifier for service validation', async () => {
    const dto = plainToInstance(SubmitDepositTxidDto, {
      txid: ` ${'A'.repeat(64)} `,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.txid).toBe('A'.repeat(64));

    const invalid = plainToInstance(SubmitDepositTxidDto, { txid: '   ' });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('requires both package and payment-rail UUIDs for deposit creation', async () => {
    const valid = plainToInstance(CreateDepositDto, {
      packagePlanItemId: PACKAGE_ITEM_ID,
      paymentRailId: PAYMENT_RAIL_ID,
    });
    await expect(validate(valid)).resolves.toHaveLength(0);

    const invalid = plainToInstance(CreateDepositDto, {
      packagePlanItemId: PACKAGE_ITEM_ID,
      paymentRailId: 'not-a-uuid',
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
