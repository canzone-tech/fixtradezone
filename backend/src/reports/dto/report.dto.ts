import { IsDateString, IsOptional } from 'class-validator';

export class ReportWindowQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
