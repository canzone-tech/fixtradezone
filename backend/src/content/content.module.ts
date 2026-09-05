import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import {
  AdminContentController,
  PublicContentController,
} from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PublicContentController, AdminContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
