import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { CommissionsService } from '../commissions/commissions.service';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AdminLedgerQueryDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';

@Controller('admin/ledger')
export class AdminLedgerController {
  constructor(private readonly walletLedgerService: WalletLedgerService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_READ)
  listLedger(@Query() query: AdminLedgerQueryDto) {
    return this.walletLedgerService.listLedger(query);
  }

  @Get(':transactionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_READ)
  getLedgerTransaction(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    return this.walletLedgerService.getLedgerTransaction(transactionId);
  }
}

@Controller('admin/deposits')
export class AdminDepositAccountingController {
  constructor(
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly commissionsService: CommissionsService,
  ) {}

  @Post(':depositId/post-accounting')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_POST)
  async postApprovedDeposit(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const context = getRequestContext(request);

    const accounting = await this.walletLedgerService.reconcileApprovedDeposit(
      depositId,
      actor,
      context,
    );

    const packageActivation =
      await this.subscriptionsService.activateAutomaticallyAfterAccounting(
        depositId,
        actor,
        context,
      );

    if (
      packageActivation.activationMode !== 'AUTO' ||
      !packageActivation.subscription
    ) {
      return {
        ...accounting,
        packageActivation,
      };
    }

    const referralCommission =
      await this.commissionsService.processSubscriptionSafely(
        packageActivation.subscription.id,
        actor,
        context,
      );

    return {
      ...accounting,
      packageActivation,
      referralCommission,
    };
  }
}
