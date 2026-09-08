import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LandingFeatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  description!: string;
}

export class CreateLandingDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brandName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  badge!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  heroTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  heroAccent!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(800)
  heroDescription!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  primaryCtaLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  primaryCtaHref!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  secondaryCtaLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  secondaryCtaHref!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => LandingFeatureDto)
  features!: LandingFeatureDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  trustTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(700)
  trustDescription!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  disclosure!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  footerText!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  seoTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  seoDescription!: string;
}

export class CreateEmailTemplateDraftDto {
  [key: string]: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  preheader!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  headline!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  ctaLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(700)
  footer!: string;
}
