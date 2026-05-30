import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDailyScheduleDto } from './dto/create-daily-schedule.dto';
import {
  clinicNowMinutes,
  minutesToTime,
  parseDateOnly,
  timeToMinutes,
  todayUtc,
} from '../../common/utils/time.util';

const DEFAULT_START = '07:00';
const DEFAULT_END = '17:00';
const DEFAULT_SLOT_DURATION = 30;
const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '13:00';
const BOOKING_BUFFER_MINUTES = 30;

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDailySchedule(doctorId: string, dto: CreateDailyScheduleDto) {
    const { date, start_time, end_time, slot_duration, is_recurring } = dto;
    const scheduleDate = parseDateOnly(date);

    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      throw new BadRequestException('start_time must be earlier than end_time');
    }

    const doctor = await this.prisma.doctorDetails.findUnique({
      where: { id: doctorId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const schedule = await this.prisma.schedule.upsert({
      where: { doctor_id_date: { doctor_id: doctorId, date: scheduleDate } },
      update: { start_time, end_time, slot_duration, is_recurring },
      create: {
        doctor_id: doctorId,
        date: scheduleDate,
        start_time,
        end_time,
        slot_duration,
        is_recurring,
      },
    });

    return { message: 'Schedule saved', schedule };
  }

  async getDoctorSchedule(doctorId: string, date: string) {
    const doctor = await this.prisma.doctorDetails.findUnique({
      where: { id: doctorId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const scheduleDate = parseDateOnly(date);
    const today = todayUtc();

    if (scheduleDate < today) {
      return {
        available: false,
        message: 'Cannot view or book for a past date',
        availableSlots: [],
      };
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { doctor_id_date: { doctor_id: doctorId, date: scheduleDate } },
    });

    const effective = schedule ?? {
      id: 'default',
      doctor_id: doctorId,
      date: scheduleDate,
      start_time: DEFAULT_START,
      end_time: DEFAULT_END,
      slot_duration: DEFAULT_SLOT_DURATION,
      is_recurring: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Dùng range [dayStart, dayEnd) thay vì so sánh bằng — tránh trường hợp
    // Prisma serialize @db.Date theo timezone khác (UTC vs local) làm hai
    // Date object có cùng "ngày" nhưng `.getTime()` khác nhau → equality miss.
    const dayStart = scheduleDate;
    const dayEnd = new Date(scheduleDate.getTime() + 24 * 60 * 60 * 1000);

    const [appointments, leaveRequests] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          doctor_id: doctorId,
          appointment_date: { gte: dayStart, lt: dayEnd },
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        },
        select: { start_time: true, end_time: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          doctor_id: doctorId,
          date: { gte: dayStart, lt: dayEnd },
          status: 'APPROVED',
        },
        select: { session: true },
      }),
    ]);

    const startMinutes = timeToMinutes(effective.start_time);
    const endMinutes = timeToMinutes(effective.end_time);
    const slotDuration = effective.slot_duration ?? DEFAULT_SLOT_DURATION;
    const breakStart = timeToMinutes(DEFAULT_BREAK_START);
    const breakEnd = timeToMinutes(DEFAULT_BREAK_END);

    const allSlots: { start_time: string; end_time: string }[] = [];
    for (
      let i = startMinutes;
      i + slotDuration <= endMinutes;
      i += slotDuration
    ) {
      if (i >= breakStart && i < breakEnd) continue;
      allSlots.push({
        start_time: minutesToTime(i),
        end_time: minutesToTime(i + slotDuration),
      });
    }

    // Chuyển booked appointments thành các interval [start, end) tính bằng phút.
    // Trước đây dùng `new Set(start_time)` so chuỗi — nhược điểm: chỉ chặn slot
    // có start_time TRÙNG HẾT (cùng từng ký tự). Nếu DB lưu " 09:00" có space
    // thừa, hoặc "9:00" thiếu leading zero, hoặc slot_duration của bác sĩ
    // thay đổi sau khi đã book (vd: 30→60ph, slot mới "09:00" trùng [09:00,
    // 10:00) overlap với appointment cũ 09:30-10:00 nhưng start_time khác
    // nhau), filter sẽ MISS. So sánh theo overlap dải [start, end) bảo đảm
    // mọi giao thoa thời gian đều bị loại.
    const occupied = appointments.map((a) => ({
      start: timeToMinutes(a.start_time),
      end: timeToMinutes(a.end_time),
    }));

    const hasFullDay = leaveRequests.some((l) => l.session === 'FULL_DAY');
    const hasMorning = leaveRequests.some((l) => l.session === 'MORNING');
    const hasAfternoon = leaveRequests.some((l) => l.session === 'AFTERNOON');

    let availableSlots = allSlots.filter((slot) => {
      const sStart = timeToMinutes(slot.start_time);
      const sEnd = timeToMinutes(slot.end_time);
      // overlap nếu slotStart < occEnd VÀ slotEnd > occStart
      if (occupied.some((r) => sStart < r.end && sEnd > r.start)) return false;
      if (hasFullDay) return false;
      if (hasMorning && sStart < breakStart) return false;
      if (hasAfternoon && sStart >= breakEnd) return false;
      return true;
    });

    const isToday = scheduleDate.getTime() === today.getTime();
    if (isToday) {
      const nowMinutes = clinicNowMinutes();
      availableSlots = availableSlots.filter(
        (slot) =>
          timeToMinutes(slot.start_time) > nowMinutes + BOOKING_BUFFER_MINUTES,
      );
    }

    return {
      available: availableSlots.length > 0,
      message:
        availableSlots.length > 0
          ? `${availableSlots.length} slot(s) available`
          : isToday
            ? 'No slots left for today'
            : 'No slots left for this date',
      schedule: {
        id: effective.id,
        doctor_id: effective.doctor_id,
        date: effective.date,
        start_time: effective.start_time,
        end_time: effective.end_time,
        slot_duration: effective.slot_duration,
        break_start_time: DEFAULT_BREAK_START,
        break_end_time: DEFAULT_BREAK_END,
        is_custom: effective.id !== 'default',
      },
      totalSlots: allSlots.length,
      bookedSlots: appointments.length,
      availableSlots,
    };
  }
}
