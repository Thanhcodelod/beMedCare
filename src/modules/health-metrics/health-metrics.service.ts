import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHealthMetricDto } from './dto/create-health-metric.dto';
import { IdentityService } from '../../common/services/identity.service';

@Injectable()
export class HealthMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async createForUser(userId: string, dto: CreateHealthMetricDto) {
    const patientId = await this.identity.getPatientIdByUserId(userId);
    return this.prisma.healthMetric.create({
      data: { ...dto, patient_id: patientId },
    });
  }

  async getHealthStatsByUserId(userId: string) {
    const patientId = await this.identity.getPatientIdByUserId(userId);

    const [patientDetails, metrics] = await Promise.all([
      this.prisma.patientDetails.findUnique({
        where: { id: patientId },
        select: {
          blood_type: true,
          allergies: true,
          medical_history: true,
        },
      }),
      this.prisma.healthMetric.findMany({
        where: { patient_id: patientId },
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    const latest = metrics[0] ?? null;

    return {
      bloodGroup: patientDetails?.blood_type ?? null,
      allergies: patientDetails?.allergies ?? [],
      history: patientDetails?.medical_history
        ? [patientDetails.medical_history]
        : [],
      currentStats: latest,
      trends: [...metrics].reverse().map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        weight: m.weight,
        height: m.height,
        heartRate: m.heart_rate,
        bloodPressure: m.blood_pressure,
        temperature: m.temperature,
        bmi: m.bmi,
      })),
    };
  }
}
