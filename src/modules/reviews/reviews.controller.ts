import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Patient leaves a review for a completed appointment',
  })
  createReview(@GetUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(userId, dto);
  }

  @Get('doctor/:doctorId')
  @ApiOperation({ summary: 'Public list of reviews for a doctor' })
  getDoctorReviews(@Param('doctorId', ParseUUIDPipe) doctorId: string) {
    return this.reviewsService.getDoctorReviews(doctorId);
  }
}
