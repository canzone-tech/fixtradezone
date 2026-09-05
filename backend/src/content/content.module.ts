import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import {
  AdminContentController,
  PublicContentController,
} from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicContentController, AdminContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
