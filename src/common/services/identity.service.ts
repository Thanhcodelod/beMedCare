import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatientIdByUserId(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { patientDetails: { select: { id: true } } },
    });
    if (!profile?.patientDetails) {
      throw new NotFoundException('Patient profile not found');
    }
    return profile.patientDetails.id;
  }

  async getDoctorIdByUserId(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { doctorDetails: { select: { id: true } } },
    });
    if (!profile?.doctorDetails) {
      throw new NotFoundException('Doctor profile not found');
    }
    return profile.doctorDetails.id;
  }

  async tryGetPatientIdByUserId(userId: string): Promise<string | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { patientDetails: { select: { id: true } } },
    });
    return profile?.patientDetails?.id ?? null;
  }

  async tryGetDoctorIdByUserId(userId: string): Promise<string | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { doctorDetails: { select: { id: true } } },
    });
    return profile?.doctorDetails?.id ?? null;
  }
}
