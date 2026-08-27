import { Controller, Get, Header } from '@nestjs/common';
import { PackagesService } from './packages.service';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getEffectiveCatalogue() {
    return this.packagesService.getEffectiveCatalogue();
  }
}
