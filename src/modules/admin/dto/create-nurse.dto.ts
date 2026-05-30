import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNurseDto {
  @ApiProperty({ example: 'nurse@clinic.local' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Initial password — front-desk staff should change it after first login.
  // Same length bounds as the public register flow so bcrypt input stays
  // bounded and we don't truncate at 72 bytes.
  @ApiProperty({ example: 'TempPassword@123', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Nguyễn Thị Lan' })
  @IsString()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
