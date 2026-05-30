import { IsEnum, IsString, IsOptional, IsDateString } from 'class-validator';
import { LeaveSession } from '@prisma/client';

export class CreateLeaveRequestDto {
  @IsDateString()
  date: string;

  @IsEnum(LeaveSession)
  session: LeaveSession;

  @IsString()
  @IsOptional()
  reason?: string;
}
