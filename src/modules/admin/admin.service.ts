import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DoctorDetails, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';
import { CreateNurseDto } from './dto/create-nurse.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  getPendingDoctors(): Promise<DoctorDetails[]> {
    return this.prisma.doctorDetails.findMany({
      where: { is_verified: false },
      include: {
        profile: {
          include: {
            user: { select: { email: true, is_active: true } },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async verifyDoctor(
    dto: VerifyDoctorDto,
  ): Promise<{ message: string; doctor: DoctorDetails }> {
    const { doctor_id, is_verified } = dto;
    try {
      const updated = await this.prisma.doctorDetails.update({
        where: { id: doctor_id },
        data: { is_verified },
      });
      return {
        message: is_verified ? 'Doctor verified' : 'Doctor rejected',
        doctor: updated,
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Doctor profile not found');
      }
      throw e;
    }
  }

  // Admin-provisioned NURSE account. Mirrors AuthService.register but skips
  // the patient details creation and lives behind ADMIN auth — front-desk
  // staff should never go through the public sign-up flow.
  async createNurse(dto: CreateNurseDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, profile } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          password_hash: hashedPassword,
          role: Role.NURSE,
        },
        select: { id: true, email: true, role: true, is_active: true },
      });
      const newProfile = await tx.profile.create({
        data: {
          user_id: newUser.id,
          full_name: dto.fullName,
          phone: dto.phone,
          avatar_url: dto.avatarUrl,
        },
      });
      return { user: newUser, profile: newProfile };
    });

    return {
      message: 'Nurse account created',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        profile: {
          fullName: profile.full_name,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
        },
      },
    };
  }
}
