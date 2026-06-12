import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { Throttle, seconds } from '@nestjs/throttler';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateDoctorDetailsDto } from './dto/update-doctor-details.dto';
import { UpdatePatientDetailsDto } from './dto/update-patient-details.dto';
import { UserWithoutPassword } from '../../common/types/user.type';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Users (Quản lý người dùng)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =========================================================================
  // 1. LẤY THÔNG TIN CÁ NHÂN (DÀNH CHO NGƯỜI ĐANG ĐĂNG NHẬP)
  // =========================================================================
  @Get('profile')
  // Read-heavy: many pages render header/avatar from this. Carve out a
  // per-route budget so the global default isn't burnt by dashboard loads.
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  // Trả về hồ sơ ĐẦY ĐỦ (kèm profile + doctorDetails/patientDetails) thay vì
  // chỉ {id,email,role} từ JWT — để trang Hồ sơ cá nhân fill sẵn được
  // ngày sinh, giới tính, SĐT, địa chỉ... đã lưu trước đó.
  getProfile(@GetUser('id') userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch('profile/me')
  @ApiOperation({ summary: 'Cập nhật thông tin profile cá nhân' })
  async updateMyProfile(
    @GetUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return await this.usersService.updateProfile(userId, dto);
  }

  @Patch('doctor-details/me')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Bác sĩ cập nhật thông tin chi tiết' })
  async updateMyDoctorDetails(
    @GetUser('id') userId: string,
    @Body() dto: UpdateDoctorDetailsDto,
  ) {
    return await this.usersService.updateDoctorDetails(userId, dto);
  }

  @Patch('patient-details/me')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Bệnh nhân cập nhật thông tin chi tiết' })
  async updateMyPatientDetails(
    @GetUser('id') userId: string,
    @Body() dto: UpdatePatientDetailsDto,
  ) {
    return await this.usersService.updatePatientDetails(userId, dto);
  }

  // =========================================================================
  // 2. LẤY DANH SÁCH BÁC SĨ (PUBLIC - DÀNH CHO BỆNH NHÂN TÌM KIẾM)
  // =========================================================================
  @Get('doctors')
  // Read-heavy: search/filter UI re-fires this on every keystroke (with
  // debounce, but still). 60/min/IP keeps autocomplete UX responsive.
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Lấy danh sách bác sĩ kèm bộ lọc' })
  async listDoctors(
    @Query('specialization') specialization?: string,
    @Query('search') search?: string,
  ) {
    return await this.usersService.getAllDoctors(true, specialization, search);
  }

  @Get('specializations')
  @ApiOperation({ summary: 'Lấy danh sách các chuyên khoa hiện có' })
  async getSpecializations() {
    return await this.usersService.getSpecializations();
  }

  // =========================================================================
  // 3. LẤY DANH SÁCH BỆNH NHÂN (ADMIN ONLY)
  // =========================================================================
  @Get('patients')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lấy danh sách toàn bộ bệnh nhân' })
  async listPatients() {
    return await this.usersService.getAllPatients();
  }

  // =========================================================================
  // 4. QUẢN TRỊ TÀI KHOẢN (ADMIN ONLY)
  // =========================================================================
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin lấy danh sách tất cả User (Bao gồm Admin khác)',
  })
  async findAll() {
    return await this.usersService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lấy chi tiết một tài khoản bất kỳ' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin cập nhật thông tin tài khoản' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin xóa (khóa) tài khoản' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.usersService.remove(id);
  }
}
