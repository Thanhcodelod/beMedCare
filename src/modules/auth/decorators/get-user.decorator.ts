import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

type AuthUser = Express.User;

export const GetUser = createParamDecorator(
  <K extends keyof AuthUser>(
    key: K | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[K] | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) return undefined;
    return key ? user[key] : user;
  },
);
