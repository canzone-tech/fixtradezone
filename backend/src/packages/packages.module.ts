import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import {
  PackagesController,
  PublicPackagesController,
} from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [
    PublicPackagesController,
    PackagesController,
    AdminPackagePlansController,
  ],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
