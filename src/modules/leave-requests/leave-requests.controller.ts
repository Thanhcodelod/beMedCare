import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Delete,
  Patch,
} from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  @Post()
  @Roles(Role.DOCTOR)
  create(@GetUser('id') userId: string, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequestsService.create(userId, dto);
  }

  @Get('my-leaves')
  @Roles(Role.DOCTOR)
  findMine(@GetUser('id') userId: string) {
    return this.leaveRequestsService.findMine(userId);
  }

  @Delete(':id')
  @Roles(Role.DOCTOR)
  cancel(@GetUser('id') userId: string, @Param('id') leaveId: string) {
    return this.leaveRequestsService.cancel(userId, leaveId);
  }

  // --- Admin Endpoints ---
  @Get('admin/all')
  @Roles(Role.ADMIN)
  findAllAdmin() {
    return this.leaveRequestsService.findAllAdmin();
  }

  @Patch('admin/:id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id') leaveId: string,
    @Body() dto: UpdateLeaveStatusDto,
  ) {
    return this.leaveRequestsService.updateStatus(leaveId, dto.status);
  }
}
