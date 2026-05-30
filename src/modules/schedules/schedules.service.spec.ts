import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SchedulesService', () => {
  let service: SchedulesService;

  const prisma = {
    doctorDetails: { findUnique: jest.fn() },
    schedule: { upsert: jest.fn(), findUnique: jest.fn() },
    appointment: { findMany: jest.fn() },
    leaveRequest: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SchedulesService);
  });

  it('rejects invalid date format', async () => {
    await expect(
      service.createDailySchedule('d', {
        date: 'not-a-date',
        start_time: '08:00',
        end_time: '12:00',
        slot_duration: 30,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects start_time >= end_time', async () => {
    await expect(
      service.createDailySchedule('d', {
        date: '2026-01-01',
        start_time: '12:00',
        end_time: '08:00',
        slot_duration: 30,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when doctor is missing', async () => {
    prisma.doctorDetails.findUnique.mockResolvedValue(null);
    await expect(
      service.createDailySchedule('d', {
        date: '2026-01-01',
        start_time: '08:00',
        end_time: '12:00',
        slot_duration: 30,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
