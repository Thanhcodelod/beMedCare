import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { Prisma, Role } from '@prisma/client';
import { IdentityService } from '../../common/services/identity.service';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  findAll() {
    return this.prisma.medicalRecord.findMany({
      include: {
        appointment: true,
        patient: { include: { profile: { select: { full_name: true } } } },
        doctor: { include: { profile: { select: { full_name: true } } } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOneScoped(id: string, user: Express.User) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        appointment: true,
        patient: { include: { profile: { select: { full_name: true } } } },
        doctor: { include: { profile: { select: { full_name: true } } } },
      },
    });
    if (!record) throw new NotFoundException('Medical record not found');

    if (user.role === Role.ADMIN) return record;

    if (user.role === Role.PATIENT) {
      const patientId = await this.identity.getPatientIdByUserId(user.id);
      if (record.patient_id !== patientId) {
        throw new ForbiddenException('Not your record');
      }
      return record;
    }

    if (user.role === Role.DOCTOR) {
      const doctorId = await this.identity.getDoctorIdByUserId(user.id);
      if (record.doctor_id !== doctorId) {
        throw new ForbiddenException('Not your record');
      }
      return record;
    }

    throw new ForbiddenException();
  }

  async findByOwnPatient(userId: string) {
    const patientId = await this.identity.getPatientIdByUserId(userId);
    return this.prisma.medicalRecord.findMany({
      where: { patient_id: patientId },
      include: {
        appointment: true,
        doctor: { include: { profile: { select: { full_name: true } } } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByOwnDoctor(userId: string) {
    const doctorId = await this.identity.getDoctorIdByUserId(userId);
    return this.prisma.medicalRecord.findMany({
      where: { doctor_id: doctorId },
      include: {
        appointment: true,
        patient: { include: { profile: { select: { full_name: true } } } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateScoped(
    id: string,
    dto: UpdateMedicalRecordDto,
    user: Express.User,
  ) {
    if (user.role === Role.DOCTOR) {
      const doctorId = await this.identity.getDoctorIdByUserId(user.id);
      const { count } = await this.prisma.medicalRecord.updateMany({
        where: { id, doctor_id: doctorId },
        data: dto,
      });
      if (count === 0) {
        // Either record missing or not the caller's — avoid leaking which.
        throw new NotFoundException('Medical record not found');
      }
      return this.prisma.medicalRecord.findUniqueOrThrow({ where: { id } });
    }

    if (user.role === Role.ADMIN) {
      try {
        return await this.prisma.medicalRecord.update({
          where: { id },
          data: dto,
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2025'
        ) {
          throw new NotFoundException('Medical record not found');
        }
        throw e;
      }
    }

    throw new ForbiddenException();
  }

  async delete(id: string) {
    try {
      await this.prisma.medicalRecord.delete({ where: { id } });
      return { message: 'Medical record deleted' };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Medical record not found');
      }
      throw e;
    }
  }
}
