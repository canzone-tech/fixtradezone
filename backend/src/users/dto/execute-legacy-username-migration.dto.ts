import { Equals, IsString } from 'class-validator';

export class ExecuteLegacyUsernameMigrationDto {
  @IsString()
  @Equals('MIGRATE_LEGACY_PUBLIC_USERNAMES')
  confirmation!: string;
}
