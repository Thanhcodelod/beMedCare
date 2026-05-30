import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { Review } from '@prisma/client';
import { IdentityService } from '../../common/services/identity.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async createReview(
    userId: string,
    dto: CreateReviewDto,
  ): Promise<{ message: string; review: Review }> {
    const { appointment_id, rating, comment } = dto;
    const patientId = await this.identity.getPatientIdByUserId(userId);

    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointment_id },
        include: { review: { select: { id: true } } },
      });

      if (!appointment) throw new NotFoundException('Appointment not found');
      if (appointment.patient_id !== patientId) {
        throw new ForbiddenException('Not your appointment');
      }
      if (appointment.status !== 'COMPLETED') {
        throw new BadRequestException(
          'You can only review completed appointments',
        );
      }
      if (appointment.review) {
        throw new ConflictException('Appointment already reviewed');
      }

      const newReview = await tx.review.create({
        data: {
          appointment_id,
          patient_id: patientId,
          doctor_id: appointment.doctor_id,
          rating,
          comment,
        },
      });

      const stats = await tx.review.aggregate({
        where: { doctor_id: appointment.doctor_id },
        _avg: { rating: true },
        _count: { id: true },
      });

      await tx.doctorDetails.update({
        where: { id: appointment.doctor_id },
        data: {
          average_rating: Number((stats._avg.rating ?? rating).toFixed(1)),
          total_reviews: stats._count.id,
        },
      });

      return { message: 'Thank you for your review', review: newReview };
    });
  }

  async getDoctorReviews(doctorId: string) {
    return this.prisma.review.findMany({
      where: { doctor_id: doctorId },
      include: {
        patient: {
          include: {
            profile: { select: { full_name: true, avatar_url: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
