import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TeleconsultationGateway } from './teleconsultation.gateway';

@ApiTags('Teleconsultation (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teleconsultation')
export class TeleconsultationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TeleconsultationGateway,
  ) {}

  // Lightweight ops endpoint. Returns size of in-memory caches per
  // gateway instance + pending SOS rows. Useful when monitoring "is the
  // teleconsultation flow alive" without pulling logs.
  @Get('health')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Snapshot of socket gateway state (per-instance)',
  })
  async health() {
    const [waitingSos, totalSos, activeAppointments] = await Promise.all([
      this.prisma.sosCall.count({ where: { status: 'WAITING' } }),
      this.prisma.sosCall.count(),
      this.prisma.appointment.count({
        where: { status: 'IN_PROGRESS', appointment_type: 'ONLINE' },
      }),
    ]);
    return {
      activeSocketsThisInstance: this.gateway.activeSocketCount(),
      waitingSos,
      totalSos,
      activeOnlineAppointments: activeAppointments,
    };
  }

  // Admin escape hatch — force-close a call that's stuck (network died,
  // doctor crashed, etc.) without making the doctor open a new tab to
  // emit endCall manually.
  @Post('admin/:appointmentId/force-end')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Force broadcast callEnded to a room and stamp call_ended_at',
  })
  async forceEnd(@Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.gateway.forceEndCall(appointmentId);
  }
}
