import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ImpersonationAuthGuard extends AuthGuard('impersonation') {}
