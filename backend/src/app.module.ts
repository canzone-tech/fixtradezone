import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { CommunicationModule } from './communication/communication.module';
import { envValidationSchema } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './database/prisma.module';
import { DepositsModule } from './deposits/deposits.module';
import { DuplicateAccountModule } from './duplicate-account/duplicate-account.module';
import { HealthModule } from './health/health.module';
import { InternalTradingModule } from './internal-trading/internal-trading.module';
import { PackagesModule } from './packages/packages.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PlatformConfigModule } from './platform-config/platform-config.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { RewardsModule } from './rewards/rewards.module';
import { SecurityConfigModule } from './security-config/security-config.module';
import { SimulatedActivityModule } from './simulated-activity/simulated-activity.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: false,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    PrismaModule,
    RedisModule,
    CommunicationModule,
    DuplicateAccountModule,
    AuthModule,
    RbacModule,
    UsersModule,
    SecurityConfigModule,
    PlatformConfigModule,
    PackagesModule,
    WalletModule,
    SubscriptionsModule,
    DepositsModule,
    RewardsModule,
    SimulatedActivityModule,
    InternalTradingModule,
    PayoutsModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}
