import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateEmailTemplateDraftDto } from '../../content/dto/content.dto';

export class TestManagedEmailTemplateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(191)
  to!: string;

  @ValidateNested()
  @Type(() => CreateEmailTemplateDraftDto)
  content!: CreateEmailTemplateDraftDto;
}
