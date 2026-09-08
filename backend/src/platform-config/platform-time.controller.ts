import { Controller, Get, Header } from '@nestjs/common';
import { OperationsConfigService } from './operations-config.service';

@Controller('platform')
export class PlatformTimeController {
  constructor(
    private readonly operationsConfigService: OperationsConfigService,
  ) {}

  @Get('time')
  @Header('Cache-Control', 'no-store')
  getPlatformTime() {
    return this.operationsConfigService.getPlatformTime();
  }
}
