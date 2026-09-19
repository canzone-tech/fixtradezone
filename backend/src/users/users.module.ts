import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { LegacyUsernameMigrationController } from './legacy-username-migration.controller';
import { LegacyUsernameMigrationService } from './legacy-username-migration.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, SecurityConfigModule],
  controllers: [UsersController, LegacyUsernameMigrationController],
  providers: [UsersService, LegacyUsernameMigrationService],
  exports: [UsersService],
})
export class UsersModule {}
