import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { ConfigureDepositBlockchainVerificationDto } from './dto/deposit-blockchain.dto';

function normalizeBoundedBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const normalized = Number(value);
    if (!Number.isSafeInteger(normalized)) {
      throw new RangeError(
        'Blockchain configuration contains an integer outside the JSON-safe range.',
      );
    }
    return normalized;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeBoundedBigInts(entry));
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeBoundedBigInts(entry),
      ]),
    );
  }

  return value;
}

@Controller('admin/deposit-payment-rails')
export class AdminDepositBlockchainConfigController {
  constructor(
    private readonly blockchainVerification: DepositBlockchainVerificationService,
  ) {}

  @Get(':railId/blockchain-config')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_READ)
  async getBlockchainConfig(
    @Param('railId', new ParseUUIDPipe()) railId: string,
  ): Promise<unknown> {
    const result = await this.blockchainVerification.getRailConfig(railId);
    return normalizeBoundedBigInts(result);
  }

  @Put(':railId/blockchain-config')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  async configureBlockchainVerification(
    @Param('railId', new ParseUUIDPipe()) railId: string,
    @Body() dto: ConfigureDepositBlockchainVerificationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    const result = await this.blockchainVerification.configureRail(
      railId,
      dto,
      actor,
      getRequestContext(request),
    );
    return normalizeBoundedBigInts(result);
  }
}
