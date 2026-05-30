import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateDoctorDetailsDto } from './dto/update-doctor-details.dto';
import { UpdatePatientDetailsDto } from './dto/update-patient-details.dto';
import { UserWithoutPassword } from '../../common/types/user.type';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserWithoutPassword[]> {
    const users = await this.prisma.user.findMany({
      include: { profile: true },
    });
    return users.map((u) => this.stripPassword(u));
  }

  async findOne(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: {
          include: { doctorDetails: true, patientDetails: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.stripPassword(user);
  }

  async update(id: string, data: UpdateUserDto): Promise<UserWithoutPassword> {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (data.email || data.role) {
          await tx.user.update({
            where: { id },
            data: {
              ...(data.email ? { email: data.email.toLowerCase() } : {}),
              ...(data.role ? { role: data.role } : {}),
            },
          });
        }
        if (data.fullName || data.phone || data.avatarUrl !== undefined) {
          await tx.profile.update({
            where: { user_id: id },
            data: {
              ...(data.fullName ? { full_name: data.fullName } : {}),
              ...(data.phone ? { phone: data.phone } : {}),
              ...(data.avatarUrl !== undefined
                ? { avatar_url: data.avatarUrl }
                : {}),
            },
          });
        }
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw e;
    }

    return this.findOne(id);
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    return this.prisma.profile.update({
      where: { user_id: userId },
      data: {
        full_name: data.fullName,
        phone: data.phone,
        avatar_url: data.avatarUrl,
        date_of_birth: data.dateOfBirth
          ? new Date(data.dateOfBirth)
          : undefined,
        gender: data.gender,
        address: data.address,
      },
    });
  }

  async updateDoctorDetails(userId: string, data: UpdateDoctorDetailsDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    return this.prisma.doctorDetails.update({
      where: { profile_id: profile.id },
      data: {
        specialization: data.specialization,
        experience_years: data.experience_years,
        bio: data.bio,
        consultation_fee:
          data.consultation_fee != null
            ? new Prisma.Decimal(data.consultation_fee)
            : undefined,
        qualifications: data.qualifications,
      },
    });
  }

  async updatePatientDetails(userId: string, data: UpdatePatientDetailsDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    return this.prisma.patientDetails.update({
      where: { profile_id: profile.id },
      data: {
        blood_type: data.blood_type,
        allergies: data.allergies,
        medical_history: data.medical_history,
        emergency_contact:
          data.emergency_contact === undefined
            ? undefined
            : (data.emergency_contact as unknown as Prisma.InputJsonValue),
      },
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: { is_active: false },
      });
      return { message: 'User deactivated successfully' };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw e;
    }
  }

  async getSpecializations(): Promise<string[]> {
    const rows = await this.prisma.doctorDetails.findMany({
      where: { is_verified: true },
      select: { specialization: true },
      distinct: ['specialization'],
    });
    return rows.map((r) => r.specialization).filter(Boolean);
  }

  async getAllDoctors(
    onlyVerified = true,
    specialization?: string,
    search?: string,
  ) {
    const where: Prisma.DoctorDetailsWhereInput = {};
    if (onlyVerified) where.is_verified = true;
    if (specialization) where.specialization = specialization;
    if (search) {
      where.profile = {
        full_name: { contains: search, mode: 'insensitive' },
      };
    }

    const doctors = await this.prisma.doctorDetails.findMany({
      where,
      include: {
        profile: {
          select: { full_name: true, phone: true, avatar_url: true },
        },
      },
      orderBy: { average_rating: 'desc' },
    });

    return doctors.map((d) => ({
      id: d.id,
      specialization: d.specialization,
      experience_years: d.experience_years,
      bio: d.bio,
      consultation_fee: d.consultation_fee?.toNumber() ?? null,
      qualifications: d.qualifications,
      average_rating: d.average_rating,
      total_reviews: d.total_reviews,
      is_verified: d.is_verified,
      profile: d.profile,
    }));
  }

  async getAllPatients() {
    return this.prisma.patientDetails.findMany({
      include: {
        profile: {
          include: { user: { select: { email: true, is_active: true } } },
        },
      },
    });
  }

  private stripPassword<T extends { password_hash: string }>(
    user: T,
  ): Omit<T, 'password_hash'> {
    const { password_hash: _p, ...rest } = user;
    return rest;
  }
}
