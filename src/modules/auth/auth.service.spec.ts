/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;

  const user = {
    findUnique: jest.fn(),
    create: jest.fn(),
  };
  const profile = { create: jest.fn() };
  const patientDetails = { create: jest.fn() };
  const doctorDetails = { create: jest.fn() };

  const mockPrisma: any = {
    user,
    profile,
    patientDetails,
    doctorDetails,
  };
  mockPrisma.$transaction = jest.fn(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma),
  );

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
  };

  const mockConfig = {
    get: jest.fn((k: string) => (k === 'JWT_EXPIRES_IN' ? '7d' : undefined)),
  };

  const mockQueue = { add: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken('reminder-queue'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'New@Example.com',
      password: 'password123',
      fullName: 'Jane Doe',
      phone: '0999',
    };

    it('rejects duplicate email', async () => {
      user.findUnique.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates user + profile + patientDetails and returns a token', async () => {
      user.findUnique.mockResolvedValueOnce(null);
      user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'new@example.com',
        role: Role.PATIENT,
        is_active: true,
      });
      profile.create.mockResolvedValueOnce({
        id: 'p1',
        full_name: 'Jane Doe',
        phone: '0999',
        avatar_url: null,
      });
      patientDetails.create.mockResolvedValueOnce({ id: 'pd1' });

      const result = await service.register(dto);

      expect(result.access_token).toBe('signed-token');
      expect(result.user.email).toBe('new@example.com');
      expect(user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@example.com' }),
        }),
      );
    });
  });

  describe('login', () => {
    const dto = { email: 'me@test.com', password: 'pw' };

    it('fails with unknown email', async () => {
      user.findUnique.mockResolvedValueOnce(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('fails with inactive user', async () => {
      user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: dto.email,
        is_active: false,
        password_hash: await bcrypt.hash(dto.password, 4),
      });
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('fails with wrong password', async () => {
      user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: dto.email,
        is_active: true,
        password_hash: await bcrypt.hash('other-password', 4),
        profile: null,
      });
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('returns token and converts Decimal fee to number', async () => {
      const consultationFee = { toNumber: () => 150000 };
      user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: dto.email,
        role: Role.DOCTOR,
        is_active: true,
        password_hash: await bcrypt.hash(dto.password, 4),
        profile: {
          full_name: 'Dr A',
          phone: '1',
          avatar_url: null,
          doctorDetails: {
            specialization: 'Cardio',
            experience_years: 3,
            bio: '',
            consultation_fee: consultationFee,
            is_verified: true,
          },
          patientDetails: null,
        },
      });

      const res = await service.login(dto);
      expect(res.access_token).toBe('signed-token');
      expect(res.user.profile?.consultation_fee).toBe(150000);
    });
  });

  describe('changePassword', () => {
    const dto = { old_password: 'old-pw', new_password: 'new-password-1' };

    it('rejects when the old password is wrong', async () => {
      user.findUnique.mockResolvedValueOnce({
        password_hash: await bcrypt.hash('different', 4),
      });
      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when new === old', async () => {
      user.findUnique.mockResolvedValueOnce({
        password_hash: await bcrypt.hash('same', 4),
      });
      await expect(
        service.changePassword('user-1', {
          old_password: 'same',
          new_password: 'same',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates password_hash AND password_changed_at on success', async () => {
      user.findUnique.mockResolvedValueOnce({
        password_hash: await bcrypt.hash('old-pw', 4),
      });
      const updateSpy = jest.fn().mockResolvedValue({});
      mockPrisma.user.update = updateSpy;

      const res = await service.changePassword('user-1', dto);
      expect(res.message).toMatch(/Password changed/);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            password_hash: expect.any(String),
            password_changed_at: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('forgotPassword (token-based)', () => {
    const genericMsg =
      'If an account exists for this email, a reset link has been sent.';

    it('returns the generic message for unknown email — no DB writes, no enqueue', async () => {
      user.findUnique.mockResolvedValueOnce(null);
      const res = await service.forgotPassword({ email: 'nope@example.com' });
      expect(res.message).toBe(genericMsg);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns the generic message for inactive accounts — no enqueue', async () => {
      user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        is_active: false,
        profile: { full_name: 'X' },
      });
      const res = await service.forgotPassword({ email: 'banned@x.com' });
      expect(res.message).toBe(genericMsg);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('invalidates old tokens, creates a new one, and enqueues a link email', async () => {
      user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        is_active: true,
        profile: { full_name: 'Jane' },
      });

      // We use the array form of $transaction. Capture both calls.
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const create = jest.fn().mockResolvedValue({});
      mockPrisma.passwordResetToken = { updateMany, create };
      mockPrisma.$transaction = jest.fn(async (ops: unknown[]) => {
        // Each op is a thenable returned by the prisma method call.
        return Promise.all(ops as Promise<unknown>[]);
      });

      await service.forgotPassword({ email: 'Jane@Test.com' });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'u1', used_at: null },
          data: { used_at: expect.any(Date) },
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'u1',
            token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            expires_at: expect.any(Date),
          }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-password-reset',
        expect.objectContaining({
          email: 'jane@test.com',
          patientName: 'Jane',
          resetUrl: expect.stringContaining('/reset-password?token='),
          expiresInMinutes: 15,
        }),
        expect.any(Object),
      );
    });
  });

  describe('resetPassword', () => {
    const TOKEN = 'a'.repeat(43); // matches DTO regex; service hashes it

    it('rejects an unknown token', async () => {
      mockPrisma.passwordResetToken = {
        findUnique: jest.fn().mockResolvedValue(null),
      };
      await expect(
        service.resetPassword({ token: TOKEN, new_password: 'newSecret123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired token', async () => {
      mockPrisma.passwordResetToken = {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          user_id: 'u1',
          used_at: null,
          expires_at: new Date(Date.now() - 60_000),
          user: { is_active: true },
        }),
      };
      await expect(
        service.resetPassword({ token: TOKEN, new_password: 'newSecret123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an already-used token', async () => {
      mockPrisma.passwordResetToken = {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          user_id: 'u1',
          used_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          user: { is_active: true },
        }),
      };
      await expect(
        service.resetPassword({ token: TOKEN, new_password: 'newSecret123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when concurrent claim already consumed the token', async () => {
      mockPrisma.passwordResetToken = {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          user_id: 'u1',
          used_at: null,
          expires_at: new Date(Date.now() + 60_000),
          user: { is_active: true },
        }),
      };
      mockPrisma.$transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            passwordResetToken: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            user: { update: jest.fn() },
          }),
      );
      await expect(
        service.resetPassword({ token: TOKEN, new_password: 'newSecret123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('claims token + rotates password + bumps password_changed_at', async () => {
      mockPrisma.passwordResetToken = {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          user_id: 'u1',
          used_at: null,
          expires_at: new Date(Date.now() + 60_000),
          user: { is_active: true },
        }),
      };
      const userUpdate = jest.fn().mockResolvedValue({});
      const tokenUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      mockPrisma.$transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            passwordResetToken: { updateMany: tokenUpdateMany },
            user: { update: userUpdate },
          }),
      );

      const res = await service.resetPassword({
        token: TOKEN,
        new_password: 'newSecret123',
      });

      expect(res.message).toMatch(/Password reset/);
      expect(tokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1', used_at: null },
          data: { used_at: expect.any(Date) },
        }),
      );
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            password_hash: expect.any(String),
            password_changed_at: expect.any(Date),
          }),
        }),
      );
    });
  });
});
