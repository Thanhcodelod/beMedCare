import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import {
  AppointmentStatus,
  LeaveStatus,
  LeaveSession,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { IdentityService } from '../../common/services/identity.service';
import { parseDateOnly, todayUtc } from '../../common/utils/time.util';

const MORNING_START = 7 * 60;
const MORNING_END = 12 * 60;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 17 * 60;

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async create(userId: string, dto: CreateLeaveRequestDto) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);
    const leaveDate = parseDateOnly(dto.date);

    if (leaveDate < todayUtc()) {
      throw new BadRequestException('Cannot request leave for a past date');
    }

    const overlapping: Prisma.LeaveRequestWhereInput[] = [
      { session: dto.session },
      { session: LeaveSession.FULL_DAY },
    ];
    if (dto.session === LeaveSession.FULL_DAY) {
      overlapping.push(
        { session: LeaveSession.MORNING },
        { session: LeaveSession.AFTERNOON },
      );
    }

    const existing = await this.prisma.leaveRequest.findFirst({
      where: {
        doctor_id: doctorId,
        date: leaveDate,
        OR: overlapping,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a leave request for this session',
      );
    }

    const [startMin, endMin] =
      dto.session === LeaveSession.MORNING
        ? [MORNING_START, MORNING_END]
        : dto.session === LeaveSession.AFTERNOON
          ? [AFTERNOON_START, AFTERNOON_END]
          : [MORNING_START, AFTERNOON_END];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctor_id: doctorId,
        appointment_date: leaveDate,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      select: { start_time: true },
    });

    const hasConflict = appointments.some((a) => {
      const [h, m] = a.start_time.split(':').map(Number);
      const mins = h * 60 + m;
      return mins >= startMin && mins < endMin;
    });
    if (hasConflict) {
      throw new BadRequestException(
        'You have appointments during the requested session',
      );
    }

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        doctor_id: doctorId,
        date: leaveDate,
        session: dto.session,
        reason: dto.reason,
        status: LeaveStatus.PENDING,
      },
    });
    return {
      message: 'Leave request submitted',
      leaveRequest,
    };
  }

  findAllAdmin() {
    return this.prisma.leaveRequest.findMany({
      include: {
        doctor: {
          include: { profile: { select: { full_name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateStatus(leaveId: string, status: LeaveStatus) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
    });
    if (!leave) throw new NotFoundException('Leave request not found');

    // Approving a leave must free up the doctor's slots: cancel any active
    // appointments that fall inside the leave window and mark their pending
    // payments as failed. Done in a single transaction so a stray appointment
    // can never survive an approved leave.
    if (status === LeaveStatus.APPROVED) {
      const [startMin, endMin] =
        leave.session === LeaveSession.MORNING
          ? [MORNING_START, MORNING_END]
          : leave.session === LeaveSession.AFTERNOON
            ? [AFTERNOON_START, AFTERNOON_END]
            : [MORNING_START, AFTERNOON_END];

      const updated = await this.prisma.$transaction(async (tx) => {
        const active = await tx.appointment.findMany({
          where: {
            doctor_id: leave.doctor_id,
            appointment_date: leave.date,
            status: {
              in: [
                AppointmentStatus.PENDING,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.IN_PROGRESS,
              ],
            },
          },
          select: { id: true, start_time: true },
        });

        const conflictIds = active
          .filter((a) => {
            const [h, m] = a.start_time.split(':').map(Number);
            const mins = h * 60 + m;
            return mins >= startMin && mins < endMin;
          })
          .map((a) => a.id);

        if (conflictIds.length > 0) {
          await tx.order.updateMany({
            where: {
              appointment_id: { in: conflictIds },
              status: OrderStatus.PENDING,
            },
            data: { status: OrderStatus.FAILED },
          });
          await tx.appointment.updateMany({
            where: { id: { in: conflictIds } },
            data: {
              status: AppointmentStatus.CANCELLED,
              cancellation_reason: 'Doctor approved leave for this slot',
            },
          });
        }

        return tx.leaveRequest.update({
          where: { id: leaveId },
          data: { status },
        });
      });
      return {
        message: `Leave request ${status.toLowerCase()}`,
        leaveRequest: updated,
      };
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status },
    });
    return {
      message: `Leave request ${status.toLowerCase()}`,
      leaveRequest: updated,
    };
  }

  async findMine(userId: string) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);
    return this.prisma.leaveRequest.findMany({
      where: { doctor_id: doctorId },
      orderBy: { date: 'desc' },
    });
  }

  async cancel(userId: string, leaveId: string) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);
    const { count } = await this.prisma.leaveRequest.deleteMany({
      where: { id: leaveId, doctor_id: doctorId, date: { gte: todayUtc() } },
    });
    if (count === 0) {
      // Either missing, not the owner's, or in the past. Return the same
      // vague 404 to avoid leaking which.
      throw new NotFoundException(
        'Leave request not found (or already past / not yours)',
      );
    }
    return { message: 'Leave request cancelled' };
  }
}
