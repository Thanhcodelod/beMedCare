import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';
import { CreateNurseDto } from './dto/create-nurse.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DoctorDetails, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Admin (Quản trị Hệ thống)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('doctors/pending')
  @ApiOperation({ summary: 'Lấy danh sách Bác sĩ đang chờ duyệt bằng cấp' })
  async getPendingDoctors(): Promise<DoctorDetails[]> {
    return await this.adminService.getPendingDoctors();
  }

  @Post('doctors/verify')
  @ApiOperation({ summary: 'Duyệt (Cấp phép) hoặc Từ chối hồ sơ Bác sĩ' })
  async verifyDoctor(
    @Body() dto: VerifyDoctorDto,
  ): Promise<{ message: string; doctor: DoctorDetails }> {
    return await this.adminService.verifyDoctor(dto);
  }

  @Post('nurses')
  @ApiOperation({
    summary: 'Admin tạo tài khoản y tá quầy (NURSE) trực tiếp',
  })
  async createNurse(@Body() dto: CreateNurseDto) {
    return await this.adminService.createNurse(dto);
  }
}
