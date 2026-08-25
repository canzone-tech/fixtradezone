import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListDirectReferralsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 1 : Number(value),
  )
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 20 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
