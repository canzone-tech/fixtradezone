import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { GenealogyPageQueryDto } from './dto/genealogy-query.dto';
import { GenealogyService } from './genealogy.service';

@Controller('referrals/me/genealogy')
export class GenealogyController {
  constructor(private readonly genealogyService: GenealogyService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GenealogyPageQueryDto,
  ) {
    return this.genealogyService.getMine(user, query);
  }
}
