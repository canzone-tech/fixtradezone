import { Equals, IsString } from 'class-validator';
import { LEGACY_USERNAME_MIGRATION_CONFIRMATION } from '../legacy-username-migration.service';

export class ExecuteLegacyUsernameMigrationDto {
  @IsString()
  @Equals(LEGACY_USERNAME_MIGRATION_CONFIRMATION)
  confirmation!: string;
}
