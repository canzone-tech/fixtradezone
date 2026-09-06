import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import { PackageDefinitionsService } from './package-definitions.service';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [PackagesController, AdminPackagePlansController],
  providers: [PackagesService, PackageDefinitionsService],
  exports: [PackagesService],
})
export class PackagesModule {}
