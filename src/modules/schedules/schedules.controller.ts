import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateDailyScheduleDto } from './dto/create-daily-schedule.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { IdentityService } from '../../common/services/identity.service';
import { Throttle, seconds } from '@nestjs/throttler';

@ApiTags('Schedules')
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly identity: IdentityService,
  ) {}

  @Post('doctor/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Doctor creates/updates their daily schedule' })
  async createSchedule(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Body() dto: CreateDailyScheduleDto,
    @GetUser() user: Express.User,
  ) {
    if (user.role === Role.DOCTOR) {
      const ownDoctorId = await this.identity.getDoctorIdByUserId(user.id);
      if (ownDoctorId !== doctorId) {
        throw new ForbiddenException('You can only modify your own schedule');
      }
    }
    return this.schedulesService.createDailySchedule(doctorId, dto);
  }

  @Get('doctor/:doctorId')
  // Booking UI calls this whenever the user picks a different date — easy
  // to fan out. Carve out 60/min so it doesn't share budget with other reads.
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'List available slots for a doctor on a given date (public)',
  })
  getAvailableSlots(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('date') date: string,
  ) {
    return this.schedulesService.getDoctorSchedule(doctorId, date);
  }
}
