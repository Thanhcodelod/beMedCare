import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
  Role,
} from '@prisma/client';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { IdentityService } from '../../common/services/identity.service';
import { OrdersService } from '../orders/orders.service';
import {
  clinicNowMinutes,
  minutesToTime,
  parseDateOnly,
  timeToMinutes,
  todayUtc,
} from '../../common/utils/time.util';
import * as crypto from 'crypto';

const DEFAULT_SLOT_DURATION = 30;
const DEFAULT_SCHEDULE_START = '07:00';
const DEFAULT_SCHEDULE_END = '17:00';
const BOOKING_BUFFER_MINUTES = 30;
const DEFAULT_CONSULTATION_FEE = 500000;

function generateAppointmentCode(dateStr: string): string {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AP-${dateStr.replace(/-/g, '')}-${suffix}`;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly orders: OrdersService,
    @InjectQueue('reminder-queue') private readonly notificationQueue: Queue,
  ) {}

  async getPatientAppointmentsByUserId(userId: string) {
    const patientId = await this.identity.getPatientIdByUserId(userId);
    return this.prisma.appointment.findMany({
      where: { patient_id: patientId },
      include: {
        doctor: {
          include: {
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
        orders: {
          select: {
            id: true,
            amount: true,
            status: true,
            transfer_code: true,
          },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { appointment_date: 'desc' },
    });
  }

  async getDoctorAppointmentsByUserId(userId: string) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);
    return this.prisma.appointment.findMany({
      where: { doctor_id: doctorId },
      include: {
        patient: {
          include: {
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
        orders: {
          select: { id: true, amount: true, status: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ appointment_date: 'desc' }, { start_time: 'desc' }],
    });
  }

  async bookAppointment(userId: string, dto: BookAppointmentDto) {
    const patientId = await this.identity.getPatientIdByUserId(userId);

    if (
      dto.appointment_type === AppointmentType.ONLINE &&
      dto.payment_method &&
      dto.payment_method !== PaymentMethod.ADVANCE_PAYMENT
    ) {
      throw new BadRequestException(
        'Online consultations require advance payment',
      );
    }

    const finalPaymentMethod: PaymentMethod =
      dto.appointment_type === AppointmentType.ONLINE
        ? PaymentMethod.ADVANCE_PAYMENT
        : (dto.payment_method ?? PaymentMethod.PAYMENT_AT_CLINIC);

    const requiresPayment =
      finalPaymentMethod === PaymentMethod.ADVANCE_PAYMENT;

    const scheduleDate = parseDateOnly(dto.appointment_date);
    const today = todayUtc();
    if (scheduleDate < today) {
      throw new ConflictException('Cannot book for a past date');
    }

    const startMinutes = timeToMinutes(dto.start_time);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const doctorDetails = await tx.doctorDetails.findUnique({
          where: { id: dto.doctor_id },
          select: {
            id: true,
            consultation_fee: true,
            is_verified: true,
          },
        });
        if (!doctorDetails) {
          throw new NotFoundException('Doctor not found');
        }
        if (!doctorDetails.is_verified) {
          throw new BadRequestException('Doctor is not verified');
        }

        const schedule = await tx.schedule.findUnique({
          where: {
            doctor_id_date: {
              doctor_id: dto.doctor_id,
              date: scheduleDate,
            },
          },
        });

        const scheduleStart = schedule?.start_time ?? DEFAULT_SCHEDULE_START;
        const scheduleEnd = schedule?.end_time ?? DEFAULT_SCHEDULE_END;
        const slotDuration = schedule?.slot_duration ?? DEFAULT_SLOT_DURATION;

        if (
          startMinutes < timeToMinutes(scheduleStart) ||
          startMinutes + slotDuration > timeToMinutes(scheduleEnd)
        ) {
          throw new ConflictException(
            `Slot ${dto.start_time} is outside working hours ${scheduleStart}-${scheduleEnd}`,
          );
        }

        if (scheduleDate.getTime() === today.getTime()) {
          const currentMinutes = clinicNowMinutes();
          if (startMinutes < currentMinutes + BOOKING_BUFFER_MINUTES) {
            throw new ConflictException(
              'Slot is too close to current time. Please choose a later slot.',
            );
          }
        }

        const endTime = minutesToTime(startMinutes + slotDuration);
        const appointmentCode = generateAppointmentCode(dto.appointment_date);
        const meetingUrl =
          dto.appointment_type === AppointmentType.ONLINE
            ? `/teleconsultation/room/${appointmentCode}`
            : null;

        const appointmentStatus: AppointmentStatus = requiresPayment
          ? AppointmentStatus.PENDING
          : AppointmentStatus.CONFIRMED;

        const appointment = await tx.appointment.create({
          data: {
            appointment_code: appointmentCode,
            patient_id: patientId,
            doctor_id: dto.doctor_id,
            schedule_id: schedule?.id ?? null,
            appointment_date: scheduleDate,
            start_time: dto.start_time,
            end_time: endTime,
            status: appointmentStatus,
            appointment_type: dto.appointment_type,
            meeting_url: meetingUrl,
            patient_note: dto.patient_note,
          },
        });

        // For ADVANCE_PAYMENT, immediately issue a SePay order so the
        // FE can render the QR right after booking. The order is linked
        // to the appointment — when the SePay webhook flips it to PAID,
        // the appointment also flips to CONFIRMED automatically.
        let order: {
          orderId: string;
          amount: number;
          transferCode: string;
          qrUrl: string;
        } | null = null;
        if (requiresPayment) {
          const fee = doctorDetails.consultation_fee
            ? doctorDetails.consultation_fee.toNumber()
            : DEFAULT_CONSULTATION_FEE;

          order = await this.orders.createOrderInTx(tx, userId, {
            amount: fee,
            appointmentId: appointment.id,
          });
        }

        return {
          message: 'Appointment booked',
          appointment,
          order,
          requires_payment: requiresPayment,
          payment_method: finalPaymentMethod,
        };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'This slot was just taken. Please choose another.',
        );
      }
      throw err;
    }
  }

  async completeAppointment(
    userId: string,
    appointmentId: string,
    dto: CompleteAppointmentDto,
  ) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          include: {
            profile: { include: { user: { select: { email: true } } } },
          },
        },
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.doctor_id !== doctorId) {
      throw new ForbiddenException(
        'You cannot complete another doctor’s appointment',
      );
    }
    if (
      appointment.status !== AppointmentStatus.CONFIRMED &&
      appointment.status !== AppointmentStatus.IN_PROGRESS
    ) {
      throw new ConflictException(
        `Cannot complete appointment in status: ${appointment.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      });

      await tx.medicalRecord.create({
        data: {
          appointment_id: appointmentId,
          patient_id: appointment.patient_id,
          doctor_id: doctorId,
          diagnosis: dto.diagnosis,
          diagnostic_code: dto.diagnostic_code,
          prescription: dto.prescription,
          doctor_advice: dto.advice,
          treatment: dto.treatment,
        },
      });
    });

    const email = appointment.patient.profile?.user.email;
    const name = appointment.patient.profile?.full_name;
    // Only send the prescription email when the doctor actually wrote
    // one. If they ticked "không cần kê đơn", `prescription` is
    // undefined/empty — don't spam the patient with a blank-prescription
    // mail.
    const hasPrescription =
      typeof dto.prescription === 'string' && dto.prescription.trim().length > 0;
    if (email && name && hasPrescription) {
      try {
        await this.notificationQueue.add(
          'send-prescription',
          {
            email,
            patientName: name,
            diagnosis: dto.diagnosis,
            prescription: dto.prescription,
          },
          {
            removeOnComplete: true,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      } catch (e) {
        this.logger.warn(
          `Failed to enqueue prescription email for appointment ${appointmentId}: ${(e as Error).message}`,
        );
      }
    }

    return { message: 'Appointment completed and medical record saved' };
  }

  async getPatientMedicalHistoryByUserId(userId: string) {
    const patientId = await this.identity.getPatientIdByUserId(userId);
    return this.getPatientMedicalHistoryByPatientId(patientId);
  }

  async getPatientMedicalHistoryByPatientId(patientId: string) {
    return this.prisma.medicalRecord.findMany({
      where: { patient_id: patientId },
      include: {
        doctor: { include: { profile: { select: { full_name: true } } } },
        appointment: {
          select: {
            appointment_date: true,
            appointment_type: true,
            appointment_code: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async hasDoctorPatientRelation(
    doctorId: string,
    patientId: string,
  ): Promise<boolean> {
    const found = await this.prisma.appointment.findFirst({
      where: { doctor_id: doctorId, patient_id: patientId },
      select: { id: true },
    });
    return !!found;
  }

  async cancelAppointment(
    appointmentId: string,
    dto: CancelAppointmentDto,
    user: Express.User,
  ): Promise<{ message: string; appointment: Appointment }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (user.role !== Role.ADMIN) {
      const [patientId, doctorId] = await Promise.all([
        this.identity.tryGetPatientIdByUserId(user.id),
        this.identity.tryGetDoctorIdByUserId(user.id),
      ]);
      const ownsAsPatient = patientId && patientId === appointment.patient_id;
      const ownsAsDoctor = doctorId && doctorId === appointment.doctor_id;
      if (!ownsAsPatient && !ownsAsDoctor) {
        throw new ForbiddenException('You cannot cancel this appointment');
      }
    }

    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new ConflictException(
        `Cannot cancel appointment in status: ${appointment.status}`,
      );
    }

    // Cancel appointment and any unpaid SePay order in one transaction
    // so the two can never drift apart.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          appointment_id: appointmentId,
          status: OrderStatus.PENDING,
        },
        data: { status: OrderStatus.FAILED },
      });
      return tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellation_reason: dto.reason ?? 'Cancelled by user',
        },
      });
    });

    return { message: 'Appointment cancelled', appointment: updated };
  }

  // Receptionist (NURSE/ADMIN) confirms the patient walked in and paid at
  // the desk. Flips the appointment from CONFIRMED → IN_PROGRESS, which
  // (a) marks the patient as present so the auto-NO_SHOW cron skips it,
  // (b) unlocks the doctor's "complete" form.
  async checkInAppointment(
    appointmentId: string,
    dto: { payment_confirmed: boolean; note?: string },
  ) {
    if (!dto.payment_confirmed) {
      throw new BadRequestException(
        'Cannot check in without confirming payment',
      );
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        appointment_type: true,
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.appointment_type !== AppointmentType.OFFLINE) {
      throw new BadRequestException(
        'Only OFFLINE appointments require front-desk check-in',
      );
    }
    // Allow check-in only from PENDING (PAYMENT_AT_CLINIC) or CONFIRMED
    // (ADVANCE_PAYMENT already SUCCESS). Block COMPLETED / CANCELLED /
    // NO_SHOW / IN_PROGRESS so the same patient cannot be checked in twice.
    if (
      appointment.status !== AppointmentStatus.PENDING &&
      appointment.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new ConflictException(
        `Cannot check in appointment in status: ${appointment.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // If a SePay order is still PENDING (rare for OFFLINE: the patient
      // chose to pay at desk in cash), mark it FAILED so accounting
      // doesn't show a stale unpaid order against this appointment.
      await tx.order.updateMany({
        where: {
          appointment_id: appointmentId,
          status: OrderStatus.PENDING,
        },
        data: { status: OrderStatus.FAILED },
      });
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.IN_PROGRESS,
          patient_note: dto.note ?? undefined,
        },
      });
      return { message: 'Patient checked in', appointment: updated };
    });
  }

  // Front-desk dashboard query: every OFFLINE appointment scheduled for
  // today, regardless of status. Nurses use this to see who has arrived,
  // who still needs to be checked in, and who already no-showed.
  async getTodayQueue() {
    const today = todayUtc();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    return this.prisma.appointment.findMany({
      where: {
        appointment_type: AppointmentType.OFFLINE,
        appointment_date: { gte: today, lt: tomorrow },
      },
      select: {
        id: true,
        appointment_code: true,
        appointment_date: true,
        start_time: true,
        end_time: true,
        status: true,
        patient_note: true,
        cancellation_reason: true,
        patient: {
          select: {
            id: true,
            profile: { select: { full_name: true, phone: true } },
          },
        },
        doctor: {
          select: {
            id: true,
            specialization: true,
            profile: { select: { full_name: true } },
          },
        },
        orders: {
          select: { id: true, amount: true, status: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { start_time: 'asc' },
    });
  }

  // Cron-fired: any OFFLINE appointment whose end_time on the booking date
  // has passed without check-in is treated as a no-show. CONFIRMED rows
  // (paid in advance) and PENDING rows (pay-at-desk, never paid) both
  // qualify. CANCELLED / IN_PROGRESS / COMPLETED / NO_SHOW are skipped.
  async sweepNoShows(): Promise<{ noShowCount: number }> {
    // We compare the appointment's wall-clock slot against "now" in UTC.
    // Server stores start_time/end_time as "HH:mm" strings, so we build
    // candidates per-day and filter in JS rather than wrestling Prisma
    // into doing string-date math.
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const yesterdayUtc = new Date(todayUtc);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        appointment_type: AppointmentType.OFFLINE,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        // Yesterday + today only: anything older than yesterday is already
        // stuck and we never want this cron to mass-update ancient rows.
        appointment_date: { gte: yesterdayUtc, lte: todayUtc },
      },
      select: {
        id: true,
        appointment_date: true,
        end_time: true,
      },
    });

    const expiredIds: string[] = [];
    for (const a of candidates) {
      const [h, m] = a.end_time.split(':').map(Number);
      const slotEndUtc = new Date(
        Date.UTC(
          a.appointment_date.getUTCFullYear(),
          a.appointment_date.getUTCMonth(),
          a.appointment_date.getUTCDate(),
          h,
          m,
        ),
      );
      if (slotEndUtc.getTime() <= now.getTime()) {
        expiredIds.push(a.id);
      }
    }

    if (expiredIds.length === 0) return { noShowCount: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          appointment_id: { in: expiredIds },
          status: OrderStatus.PENDING,
        },
        data: { status: OrderStatus.FAILED },
      });
      await tx.appointment.updateMany({
        where: { id: { in: expiredIds } },
        data: {
          status: AppointmentStatus.NO_SHOW,
          cancellation_reason:
            'Auto: end of slot reached without front-desk check-in',
        },
      });
    });

    this.logger.warn(`Auto NO_SHOW swept ${expiredIds.length} appointments`);
    return { noShowCount: expiredIds.length };
  }
}
