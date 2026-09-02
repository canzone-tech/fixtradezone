import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { UsersModule } from './users/users.module';
import { SecurityConfigModule } from './security-config/security-config.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlatformConfigModule } from './platform-config/platform-config.module';
import { RedisModule } from './redis/redis.module';
import { PackagesModule } from './packages/packages.module';
import { WalletModule } from './wallet/wallet.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DepositsModule } from './deposits/deposits.module';
import { RewardsModule } from './rewards/rewards.module';
import { SimulatedActivityModule } from './simulated-activity/simulated-activity.module';
import { InternalTradingModule } from './internal-trading/internal-trading.module';
import { PayoutsModule } from './payouts/payouts.module';

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
