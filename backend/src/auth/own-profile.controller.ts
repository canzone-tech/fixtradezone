import { Controller, Get, Header } from '@nestjs/common';
import type { AuthenticatedUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import { OwnProfileService } from './own-profile.service';

@Controller('auth/me/profile')
export class OwnProfileController {
  constructor(private readonly ownProfileService: OwnProfileService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  getProfileCompletion(@CurrentUser() user: AuthenticatedUser) {
    return this.ownProfileService.getCompletion(user.id);
  }
}
