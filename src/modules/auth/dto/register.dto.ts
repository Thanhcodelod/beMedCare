import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Max length guards against absurdly long inputs that would make
  // bcrypt burn CPU (and bcrypt itself silently truncates past 72 bytes).
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  // Thông tin profile
  @IsString()
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  // Ngày sinh (ISO date "YYYY-MM-DD"). Tuỳ chọn khi đăng ký.
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  // Giới tính: MALE / FEMALE / OTHER (enum Gender của Prisma). Tuỳ chọn.
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
