import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { HealthMetricsService } from './health-metrics.service';
import { CreateHealthMetricDto } from './dto/create-health-metric.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class HealthMetricsController {
  constructor(private readonly svc: HealthMetricsService) {}

  @Get('me/health-stats')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: "Patient's own health stats" })
  getMyHealthStats(@GetUser('id') userId: string) {
    return this.svc.getHealthStatsByUserId(userId);
  }

  @Post('me/health-metrics')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient records a new health metric' })
  createMine(
    @GetUser('id') userId: string,
    @Body() dto: CreateHealthMetricDto,
  ) {
    return this.svc.createForUser(userId, dto);
  }
}
