import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../modules/auth/role';

export interface AppRequest extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
}

export function requestContext(req: AppRequest, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
