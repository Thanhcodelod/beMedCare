import { BadRequestException } from '@nestjs/common';

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseDateOnly(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
  }
  return new Date(`${input}T00:00:00.000Z`);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Phòng khám hoạt động theo giờ Việt Nam (UTC+7, không có DST). Các chuỗi giờ
// slot ("08:00"...) là giờ địa phương này, nên mọi so sánh với "bây giờ" phải
// quy về cùng múi giờ — nếu dùng giờ UTC trực tiếp sẽ lệch 7 tiếng.
const CLINIC_TZ_OFFSET_MINUTES = 7 * 60;

export function clinicNowMinutes(): number {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + CLINIC_TZ_OFFSET_MINUTES) % (24 * 60);
}
