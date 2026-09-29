import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role restriction means any authenticated user can proceed.
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;

    if (!user || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('You do not have permission');
    }

    return true;
  }
}
