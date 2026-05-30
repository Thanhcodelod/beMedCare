import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Analytics (Thống kê & Phân tích)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('doctors/:id/performance')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Lấy thống kê hiệu suất của bác sĩ' })
  async getDoctorPerformance(
    @Param('id') id: string,
    @GetUser() user: Express.User,
  ) {
    return await this.analyticsService.getDoctorPerformance(id, user);
  }

  @Get('admin/analytics')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy thống kê tổng quan cho Admin' })
  async getAdminAnalytics() {
    return await this.analyticsService.getAdminAnalytics();
  }
}
