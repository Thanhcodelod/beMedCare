import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CheckInDto } from './dto/check-in.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { IdentityService } from '../../common/services/identity.service';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly identity: IdentityService,
  ) {}

  @Post('book')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient books an appointment (OFFLINE/ONLINE)' })
  async book(@GetUser('id') userId: string, @Body() dto: BookAppointmentDto) {
    return this.appointmentsService.bookAppointment(userId, dto);
  }

  @Get('my-appointments/patient')
  @Roles(Role.PATIENT)
  // Dashboard + appointment list page + post-booking confirmation poll all
  // hit this. With StrictMode dev double-mount + multi-tab, the global
  // 300/60s budget gets eaten quickly. Give this route its own 120/60s
  // bucket so dashboard reloads don't trip 429s.
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  @ApiOperation({ summary: "Patient's own appointments" })
  async getMyPatientApps(@GetUser('id') userId: string) {
    return this.appointmentsService.getPatientAppointmentsByUserId(userId);
  }

  @Get('my-appointments/doctor')
  @Roles(Role.DOCTOR)
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  @ApiOperation({ summary: "Doctor's own appointments" })
  async getMyDoctorApps(@GetUser('id') userId: string) {
    return this.appointmentsService.getDoctorAppointmentsByUserId(userId);
  }

  @Post(':appointmentId/complete')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor completes an appointment + medical record' })
  async complete(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @GetUser('id') userId: string,
    @Body() dto: CompleteAppointmentDto,
  ) {
    return this.appointmentsService.completeAppointment(
      userId,
      appointmentId,
      dto,
    );
  }

  @Get('patient-history')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: "Patient's own medical history" })
  async getMyHistory(@GetUser('id') userId: string) {
    return this.appointmentsService.getPatientMedicalHistoryByUserId(userId);
  }

  @Get('patient-history/:patientId')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({
    summary: "Doctor/Admin views a patient's medical history",
  })
  async getPatientHistory(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @GetUser() user: Express.User,
  ) {
    if (user.role === Role.DOCTOR) {
      const doctorId = await this.identity.getDoctorIdByUserId(user.id);
      const hasRelation =
        await this.appointmentsService.hasDoctorPatientRelation(
          doctorId,
          patientId,
        );
      if (!hasRelation) {
        throw new ForbiddenException(
          'You can only view history of your own patients',
        );
      }
    }
    return this.appointmentsService.getPatientMedicalHistoryByPatientId(
      patientId,
    );
  }

  @Patch(':appointmentId/cancel')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel an appointment' })
  async cancelAppointment(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CancelAppointmentDto,
    @GetUser() user: Express.User,
  ) {
    return this.appointmentsService.cancelAppointment(appointmentId, dto, user);
  }

  @Get('today/queue')
  @Roles(Role.NURSE, Role.ADMIN)
  @ApiOperation({
    summary:
      "Front-desk queue: every OFFLINE appointment scheduled today, sorted by start_time",
  })
  async getTodayQueue() {
    return this.appointmentsService.getTodayQueue();
  }

  @Post(':appointmentId/check-in')
  @Roles(Role.NURSE, Role.ADMIN)
  @ApiOperation({
    summary:
      'Front-desk receptionist confirms patient arrived + paid (OFFLINE only)',
  })
  async checkIn(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CheckInDto,
  ) {
    return this.appointmentsService.checkInAppointment(appointmentId, dto);
  }

  // Admin-only manual trigger for the auto-NO_SHOW sweep. The cron
  // already runs every 5 minutes, but ops may want to flip overdue rows
  // immediately after fixing a config issue or backfilling.
  @Post('admin/sweep-no-shows')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Manually trigger the auto-NO_SHOW sweep over OFFLINE appointments',
  })
  async sweepNoShows() {
    return this.appointmentsService.sweepNoShows();
  }
}
