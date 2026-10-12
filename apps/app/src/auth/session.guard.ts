import {
  createParamDecorator,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@vet-clinic/types';
import { Clinic } from '../clinic';
import { CLINIC, sessionToken } from '../http';

interface AuthenticatedRequest extends Request {
  clinicUser: User;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.clinicUser = await this.clinic.auth.authenticate(sessionToken(request));
    return true;
  }
}

/** Use with SessionGuard; ownership and role rules also run inside each service. */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().clinicUser;
});
