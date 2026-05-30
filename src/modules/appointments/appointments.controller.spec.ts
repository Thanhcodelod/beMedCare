import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { IdentityService } from '../../common/services/identity.service';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;

  const svc = {
    bookAppointment: jest.fn(),
    getPatientAppointmentsByUserId: jest.fn(),
    getDoctorAppointmentsByUserId: jest.fn(),
    completeAppointment: jest.fn(),
    getPatientMedicalHistoryByUserId: jest.fn(),
    getPatientMedicalHistoryByPatientId: jest.fn(),
    hasDoctorPatientRelation: jest.fn(),
    cancelAppointment: jest.fn(),
  };

  const identity = {
    getDoctorIdByUserId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: svc },
        { provide: IdentityService, useValue: identity },
      ],
    }).compile();
    controller = module.get(AppointmentsController);
  });

  it('forbids DOCTOR viewing history of a patient they never saw', async () => {
    identity.getDoctorIdByUserId.mockResolvedValue('doctor-1');
    svc.hasDoctorPatientRelation.mockResolvedValue(false);

    await expect(
      controller.getPatientHistory('patient-1', {
        id: 'user-1',
        email: 'd@x.com',
        role: Role.DOCTOR,
        is_active: true,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows ADMIN viewing any patient history', async () => {
    svc.getPatientMedicalHistoryByPatientId.mockResolvedValue([]);
    await controller.getPatientHistory('patient-1', {
      id: 'a',
      email: 'a@x.com',
      role: Role.ADMIN,
      is_active: true,
    });
    expect(identity.getDoctorIdByUserId).not.toHaveBeenCalled();
    expect(svc.getPatientMedicalHistoryByPatientId).toHaveBeenCalledWith(
      'patient-1',
    );
  });
});
