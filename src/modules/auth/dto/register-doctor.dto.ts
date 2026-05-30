import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';

export class RegisterDoctorDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // Thông tin profile
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  // Thông tin bác sĩ
  @IsString()
  specialization: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  experience_years?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  consultation_fee?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];
}
