import type { Request } from 'express';
import type { RequestContext } from './auth.types';

export function getRequestContext(request: Request): RequestContext {
  const userAgent = request.get('user-agent');

  return {
    ipAddress: request.ip || request.socket.remoteAddress,
    userAgent: userAgent?.slice(0, 1000),
  };
}
