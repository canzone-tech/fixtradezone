import { Transform } from 'class-transformer';
import { IsUUID } from 'class-validator';

export class ObserveDeviceInstallationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsUUID('4')
  deviceInstallationId!: string;
}
