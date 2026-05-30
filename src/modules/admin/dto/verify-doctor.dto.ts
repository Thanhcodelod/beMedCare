import {
  IsBoolean,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDoctorDto {
  @ApiProperty({ example: 'uuid-cua-doctor-details' })
  @IsNotEmpty()
  @IsUUID()
  doctor_id: string;

  @ApiProperty({ example: true, description: 'True: Duyệt, False: Từ chối' })
  @IsNotEmpty()
  @IsBoolean()
  is_verified: boolean;

  @ApiProperty({ example: 'Bằng cấp mờ, yêu cầu chụp lại' })
  @IsOptional()
  @IsString()
  admin_note?: string;
}
