import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Medical Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly svc: MedicalRecordsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lists all medical records' })
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a medical record (owner or admin)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: Express.User,
  ) {
    return this.svc.findOneScoped(id, user);
  }

  @Get('patient/me')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: "Patient's own medical records" })
  findMineAsPatient(@GetUser('id') userId: string) {
    return this.svc.findByOwnPatient(userId);
  }

  @Get('doctor/me')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: "Doctor's authored records" })
  findMineAsDoctor(@GetUser('id') userId: string) {
    return this.svc.findByOwnDoctor(userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DOCTOR)
  @ApiOperation({
    summary: 'Update medical record (authoring doctor or admin)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicalRecordDto,
    @GetUser() user: Express.User,
  ) {
    return this.svc.updateScoped(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete medical record' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.delete(id);
  }
}
