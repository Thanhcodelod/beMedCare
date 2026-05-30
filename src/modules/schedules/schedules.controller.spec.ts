import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { IdentityService } from '../../common/services/identity.service';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('SchedulesController', () => {
  let controller: SchedulesController;

  const svc = {
    createDailySchedule: jest.fn(),
    getDoctorSchedule: jest.fn(),
  };
  const identity = { getDoctorIdByUserId: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        { provide: SchedulesService, useValue: svc },
        { provide: IdentityService, useValue: identity },
      ],
    }).compile();
    controller = module.get(SchedulesController);
  });

  it('forbids doctor A from editing doctor B’s schedule', async () => {
    identity.getDoctorIdByUserId.mockResolvedValue('doctor-A');
    await expect(
      controller.createSchedule(
        'doctor-B',
        {
          date: '2026-01-01',
          start_time: '08:00',
          end_time: '12:00',
          slot_duration: 30,
        },
        { id: 'u', email: 'e', role: Role.DOCTOR, is_active: true },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows ADMIN to create any doctor’s schedule', async () => {
    svc.createDailySchedule.mockResolvedValue({ schedule: { id: 's' } });
    await controller.createSchedule(
      'doctor-B',
      {
        date: '2026-01-01',
        start_time: '08:00',
        end_time: '12:00',
        slot_duration: 30,
      },
      { id: 'admin', email: 'a', role: Role.ADMIN, is_active: true },
    );
    expect(svc.createDailySchedule).toHaveBeenCalled();
  });
});
