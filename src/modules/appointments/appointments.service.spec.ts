/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from '../../common/services/identity.service';
import { OrdersService } from '../orders/orders.service';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  PaymentMethod,
  Prisma,
  Role,
} from '@prisma/client';

function futureDateIso(days = 7): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  const prisma: any = {
    appointment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctorDetails: { findUnique: jest.fn() },
    schedule: { findUnique: jest.fn() },
    order: { create: jest.fn(), updateMany: jest.fn() },
    medicalRecord: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(prisma),
  );

  const identity = {
    getPatientIdByUserId: jest.fn(),
    getDoctorIdByUserId: jest.fn(),
    tryGetPatientIdByUserId: jest.fn(),
    tryGetDoctorIdByUserId: jest.fn(),
  };

  const queue = { add: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const ordersService = {
      createOrderInTx: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        amount: 0,
        transferCode: 'ORD-XXXXXX-YYYYYY',
        qrUrl: 'https://example/qr',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdentityService, useValue: identity },
        { provide: OrdersService, useValue: ordersService },
        { provide: getQueueToken('reminder-queue'), useValue: queue },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  describe('bookAppointment', () => {
    const dto = {
      doctor_id: '11111111-1111-1111-1111-111111111111',
      appointment_date: futureDateIso(7),
      start_time: '09:00',
      appointment_type: AppointmentType.OFFLINE,
      payment_method: PaymentMethod.PAYMENT_AT_CLINIC,
    };

    it('resolves patient via JWT user id, ignoring any body input', async () => {
      identity.getPatientIdByUserId.mockResolvedValue('patient-1');
      prisma.doctorDetails.findUnique.mockResolvedValue({
        id: dto.doctor_id,
        consultation_fee: null,
        is_verified: true,
      });
      prisma.schedule.findUnique.mockResolvedValue(null);
      prisma.appointment.create.mockResolvedValue({ id: 'apt-1' });

      const res = await service.bookAppointment('user-1', dto);

      expect(identity.getPatientIdByUserId).toHaveBeenCalledWith('user-1');
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patient_id: 'patient-1' }),
        }),
      );
      expect(res.requires_payment).toBe(false);
    });

    it('rejects booking when ONLINE + PAYMENT_AT_CLINIC', async () => {
      await expect(
        service.bookAppointment('user-1', {
          ...dto,
          appointment_type: AppointmentType.ONLINE,
          payment_method: PaymentMethod.PAYMENT_AT_CLINIC,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when DB raises P2002 (race)', async () => {
      identity.getPatientIdByUserId.mockResolvedValue('patient-1');
      prisma.doctorDetails.findUnique.mockResolvedValue({
        id: dto.doctor_id,
        consultation_fee: null,
        is_verified: true,
      });
      prisma.schedule.findUnique.mockResolvedValue(null);
      prisma.appointment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(service.bookAppointment('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects booking for a past date', async () => {
      const past = new Date();
      past.setUTCDate(past.getUTCDate() - 1);
      await expect(
        service.bookAppointment('user-1', {
          ...dto,
          appointment_date: past.toISOString().slice(0, 10),
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('completeAppointment', () => {
    const dto = {
      diagnosis: 'Flu',
      prescription: 'Rest and hydrate',
    };

    it('forbids completing another doctor’s appointment', async () => {
      identity.getDoctorIdByUserId.mockResolvedValue('doctor-1');
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        doctor_id: 'doctor-2',
        patient_id: 'p1',
        status: AppointmentStatus.CONFIRMED,
        patient: {
          full_name: 'x',
          profile: { user: { email: 'x@y.com' } },
        },
      });
      await expect(
        service.completeAppointment('user-1', 'apt-1', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses wrong status', async () => {
      identity.getDoctorIdByUserId.mockResolvedValue('doctor-1');
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        doctor_id: 'doctor-1',
        status: AppointmentStatus.PENDING,
        patient: {
          profile: { full_name: 'x', user: { email: 'x@y.com' } },
        },
      });
      await expect(
        service.completeAppointment('user-1', 'apt-1', dto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelAppointment', () => {
    it('forbids a stranger from cancelling', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        patient_id: 'pX',
        doctor_id: 'dY',
        status: AppointmentStatus.CONFIRMED,
      });
      identity.tryGetPatientIdByUserId.mockResolvedValue('pZ');
      identity.tryGetDoctorIdByUserId.mockResolvedValue(null);

      await expect(
        service.cancelAppointment(
          'apt-1',
          {},
          {
            id: 'u1',
            email: 'e',
            role: Role.PATIENT,
            is_active: true,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to cancel', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        patient_id: 'pX',
        doctor_id: 'dY',
        status: AppointmentStatus.CONFIRMED,
      });
      prisma.appointment.update.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.CANCELLED,
      });

      const res = await service.cancelAppointment(
        'apt-1',
        { reason: 'admin override' },
        { id: 'admin', email: 'a', role: Role.ADMIN, is_active: true },
      );
      expect(res.appointment.status).toBe(AppointmentStatus.CANCELLED);
    });
  });
});
