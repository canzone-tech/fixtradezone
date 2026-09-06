import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [PackagesController, AdminPackagePlansController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
