/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;

  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    profile: { update: jest.fn() },
    doctorDetails: { findMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(prisma),
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('findAll strips password_hash', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: '1',
        email: 'a@b.com',
        password_hash: 'secret',
        role: Role.PATIENT,
      },
    ]);
    const res = await service.findAll();
    expect(res[0]).not.toHaveProperty('password_hash');
  });

  it('findOne throws 404 when user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('remove soft-deactivates and returns a message', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1' });
    prisma.user.update.mockResolvedValue({ id: '1', is_active: false });
    const res = await service.remove('1');
    expect(res.message).toMatch(/deactivated/i);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { is_active: false },
    });
  });

  it('getAllDoctors converts Decimal fees to number', async () => {
    prisma.doctorDetails.findMany.mockResolvedValue([
      {
        id: 'd',
        specialization: 'x',
        experience_years: 1,
        bio: '',
        consultation_fee: { toNumber: () => 123 },
        qualifications: [],
        average_rating: 5,
        total_reviews: 2,
        profile: { full_name: 'a', phone: '1', avatar_url: null },
      },
    ]);
    const res = await service.getAllDoctors();
    expect(res[0].consultation_fee).toBe(123);
  });
});
