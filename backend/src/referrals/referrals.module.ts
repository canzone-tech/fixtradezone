import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AdminGenealogyController } from './admin-genealogy.controller';
import { AdminReferralsController } from './admin-referrals.controller';
import { GenealogyController } from './genealogy.controller';
import { GenealogyService } from './genealogy.service';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [
    ReferralsController,
    GenealogyController,
    AdminReferralsController,
    AdminGenealogyController,
  ],
  providers: [ReferralsService, GenealogyService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
