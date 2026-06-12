import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Prisma, Role } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
// 32 random bytes → 43 base64url chars. ~256 bits of entropy.
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectQueue('reminder-queue') private readonly mailQueue: Queue,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, profile } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          password_hash: hashedPassword,
          role: Role.PATIENT,
        },
        select: { id: true, email: true, role: true, is_active: true },
      });

      const newProfile = await tx.profile.create({
        data: {
          user_id: newUser.id,
          full_name: dto.fullName,
          phone: dto.phone,
          avatar_url: dto.avatarUrl,
          date_of_birth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
        },
      });

      await tx.patientDetails.create({
        data: { profile_id: newProfile.id },
      });

      return { user: newUser, profile: newProfile };
    });

    const access_token = await this.signToken(user.id, user.email, user.role);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.getExpirySeconds(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        profile: {
          fullName: profile.full_name,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
        },
      },
    };
  }

  async registerDoctor(dto: RegisterDoctorDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, profile, doctorDetails } = await this.prisma.$transaction(
      async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            password_hash: hashedPassword,
            role: Role.DOCTOR,
          },
          select: { id: true, email: true, role: true, is_active: true },
        });

        const newProfile = await tx.profile.create({
          data: {
            user_id: newUser.id,
            full_name: dto.fullName,
            phone: dto.phone,
            avatar_url: dto.avatarUrl,
          },
        });

        const newDoctorDetails = await tx.doctorDetails.create({
          data: {
            profile_id: newProfile.id,
            specialization: dto.specialization,
            experience_years: dto.experience_years ?? 0,
            bio: dto.bio,
            consultation_fee:
              dto.consultation_fee != null
                ? new Prisma.Decimal(dto.consultation_fee)
                : null,
            qualifications: dto.qualifications ?? [],
            is_verified: false,
          },
        });

        return {
          user: newUser,
          profile: newProfile,
          doctorDetails: newDoctorDetails,
        };
      },
    );

    const access_token = await this.signToken(user.id, user.email, user.role);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.getExpirySeconds(),
      message:
        'Doctor registration successful. Please wait for admin approval.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        doctorId: doctorDetails.id,
        profile: {
          fullName: profile.full_name,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
        },
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        profile: {
          include: {
            doctorDetails: true,
            patientDetails: true,
          },
        },
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const access_token = await this.signToken(user.id, user.email, user.role);

    const doctor = user.profile?.doctorDetails;
    const patient = user.profile?.patientDetails;

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.getExpirySeconds(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        profile: user.profile
          ? {
              fullName: user.profile.full_name,
              phone: user.profile.phone,
              avatarUrl: user.profile.avatar_url,
              specialization: doctor?.specialization,
              experience_years: doctor?.experience_years,
              bio: doctor?.bio,
              consultation_fee: doctor?.consultation_fee?.toNumber(),
              is_verified: doctor?.is_verified,
              blood_type: patient?.blood_type,
            }
          : null,
      },
    };
  }

  logout(_userId: string): Promise<{ message: string }> {
    // JWT is stateless — the guard already validated the user is active.
    // When a refresh-token table is added, revoke here.
    return Promise.resolve({ message: 'Logout success' });
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.old_password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Old password is incorrect');
    }
    if (dto.old_password === dto.new_password) {
      throw new BadRequestException(
        'New password must differ from the old one',
      );
    }

    const hash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: hash,
        password_changed_at: new Date(),
      },
    });

    return {
      message: 'Password changed successfully. Please log in again.',
    };
  }

  /**
   * Forgot-password flow (token-link).
   *
   * 1. Look up user by email. Always return the same generic response
   *    regardless of existence — prevents account enumeration.
   * 2. Invalidate any pending reset tokens for the user (single-active-token).
   * 3. Generate a 256-bit token, store its SHA-256 hash with a 15-minute
   *    expiry. The raw token only ever exists in the email body.
   * 4. Enqueue an email with the reset link.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    const generic = {
      message:
        'If an account exists for this email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        is_active: true,
        profile: { select: { full_name: true } },
      },
    });
    if (!user || !user.is_active) {
      return generic;
    }

    const { raw, hash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      // Invalidate any prior unused tokens for this user — only one active
      // reset link at a time.
      this.prisma.passwordResetToken.updateMany({
        where: { user_id: user.id, used_at: null },
        data: { used_at: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          user_id: user.id,
          token_hash: hash,
          expires_at: expiresAt,
        },
      }),
    ]);

    const baseUrl =
      this.configService.get<string>('FRONTEND_BASE_URL') ??
      'http://localhost:3001';
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(raw)}`;

    try {
      await this.mailQueue.add(
        'send-password-reset',
        {
          email,
          patientName: user.profile?.full_name ?? 'User',
          resetUrl,
          expiresInMinutes: Math.floor(RESET_TOKEN_TTL_MS / 60_000),
        },
        {
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    } catch (e) {
      this.logger.error(
        `Failed to enqueue reset link for ${email}: ${(e as Error).message}`,
      );
      // Don't expose whether enqueue failed — keep response generic.
    }

    return generic;
  }

  /**
   * Verify a reset token and apply the new password atomically.
   *
   * - Token is consumed (used_at set) within the same transaction as the
   *   password update — no race where a token survives a failed update.
   * - password_changed_at is bumped — invalidates any stale JWTs.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);

    const tokenRow = await this.prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
      select: {
        id: true,
        user_id: true,
        used_at: true,
        expires_at: true,
        user: { select: { is_active: true } },
      },
    });

    if (
      !tokenRow ||
      tokenRow.used_at !== null ||
      tokenRow.expires_at.getTime() <= Date.now() ||
      !tokenRow.user.is_active
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    const now = new Date();

    // Atomically claim the token + rotate the password in one transaction.
    // updateMany with `used_at: null` filter is the conditional update —
    // count===0 means another concurrent reset already claimed it.
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: tokenRow.id, used_at: null },
        data: { used_at: now },
      });
      if (claimed.count === 0) {
        return { ok: false as const };
      }
      await tx.user.update({
        where: { id: tokenRow.user_id },
        data: {
          password_hash: newHash,
          password_changed_at: now,
        },
      });
      return { ok: true as const };
    });

    if (!result.ok) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    return {
      message: 'Password reset successfully. Please log in.',
    };
  }

  private signToken(userId: string, email: string, role: Role) {
    return this.jwtService.signAsync({ sub: userId, email, role });
  }

  private getExpirySeconds(): number {
    const raw = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) return 7 * 24 * 60 * 60;
    const [, nStr, unit] = match;
    const n = parseInt(nStr, 10);
    switch (unit) {
      case 's':
        return n;
      case 'm':
        return n * 60;
      case 'h':
        return n * 60 * 60;
      case 'd':
      default:
        return n * 24 * 60 * 60;
    }
  }
}
