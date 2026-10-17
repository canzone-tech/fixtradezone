import { IsString, Matches, MaxLength } from 'class-validator';

export class WebPushSubscriptionDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{80,120}$/, {
    message: 'Invalid browser push public key.',
  })
  p256dh!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,64}$/, {
    message: 'Invalid browser push authentication key.',
  })
  auth!: string;
}

export class WebPushUnsubscribeDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}
