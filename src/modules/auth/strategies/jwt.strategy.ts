import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  // jsonwebtoken adds this automatically; declared so we can read it.
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<Express.User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        is_active: true,
        password_changed_at: true,
      },
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid or inactive account');
    }

    // Reject tokens issued before the most recent password change.
    // `iat` is in seconds since epoch; password_changed_at is a Date.
    // We use `>=` to win the race when a token is issued the same second
    // a password rotation happens — the safer side is "force re-login".
    if (user.password_changed_at && payload.iat) {
      const changedAtSec = Math.floor(
        user.password_changed_at.getTime() / 1000,
      );
      if (payload.iat <= changedAtSec) {
        throw new UnauthorizedException('Token revoked. Please log in again.');
      }
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    };
  }
}
