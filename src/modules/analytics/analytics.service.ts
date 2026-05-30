import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from '../../common/services/identity.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async getDoctorPerformance(
    doctorUserIdOrDetailsId: string,
    currentUser: Express.User,
  ) {
    let doctorId = doctorUserIdOrDetailsId;
    const resolved = await this.identity.tryGetDoctorIdByUserId(
      doctorUserIdOrDetailsId,
    );
    if (resolved) doctorId = resolved;

    // A doctor can only view their own performance. Admin bypasses this check.
    if (currentUser.role === Role.DOCTOR) {
      const ownDoctorId = await this.identity.tryGetDoctorIdByUserId(
        currentUser.id,
      );
      if (!ownDoctorId || ownDoctorId !== doctorId) {
        throw new ForbiddenException(
          'You can only view your own performance stats',
        );
      }
    }

    const doctorDetails = await this.prisma.doctorDetails.findUnique({
      where: { id: doctorId },
      select: { id: true, average_rating: true },
    });
    if (!doctorDetails) throw new NotFoundException('Doctor not found');

    const now = new Date();
    const todayStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const weekStartUtc = new Date(todayStartUtc);
    weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() - 6);
    const tomorrowUtc = new Date(todayStartUtc);
    tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);

    const patientsToday = await this.prisma.appointment.count({
      where: {
        doctor_id: doctorId,
        appointment_date: { gte: todayStartUtc, lt: tomorrowUtc },
        status: { not: 'CANCELLED' },
      },
    });

    const weekly = await this.prisma.appointment.groupBy({
      by: ['appointment_date'],
      where: {
        doctor_id: doctorId,
        status: 'COMPLETED',
        appointment_date: { gte: weekStartUtc, lt: tomorrowUtc },
      },
      _count: { _all: true },
    });

    const weeklyMap = new Map<string, number>();
    for (const w of weekly) {
      weeklyMap.set(
        w.appointment_date.toISOString().slice(0, 10),
        w._count._all,
      );
    }
    const weeklyAppointments: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStartUtc);
      d.setUTCDate(d.getUTCDate() - i);
      weeklyAppointments.push(weeklyMap.get(d.toISOString().slice(0, 10)) ?? 0);
    }

    return {
      patientsToday,
      consultationTimeAvg: '15m',
      satisfactionRate: doctorDetails.average_rating,
      weeklyAppointments,
    };
  }

  async getAdminAnalytics() {
    // Aggregate peak hours in SQL — avoids loading every completed
    // appointment into memory. start_time is stored as "HH:mm" string.
    const [rows, orders, total] = await Promise.all([
      this.prisma.$queryRaw<{ hour: string; count: bigint }[]>`
        SELECT substring(start_time, 1, 2) AS hour, COUNT(*)::bigint AS count
        FROM appointments
        WHERE status = 'COMPLETED'
        GROUP BY hour
        ORDER BY hour
      `,
      this.prisma.order.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
    ]);

    const peakHours: Record<string, number> = {};
    for (const r of rows) peakHours[r.hour] = Number(r.count);

    return {
      peakHours,
      totalRevenue: Number(orders._sum.amount ?? 0),
      totalAppointments: total,
    };
  }
}
