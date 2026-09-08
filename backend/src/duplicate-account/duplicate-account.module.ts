import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AdminDuplicateAccountController } from './admin-duplicate-account.controller';
import { DeviceInstallationController } from './device-installation.controller';
import { DuplicateAccountService } from './duplicate-account.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [AdminDuplicateAccountController, DeviceInstallationController],
  providers: [DuplicateAccountService],
  exports: [DuplicateAccountService],
})
export class DuplicateAccountModule {}
