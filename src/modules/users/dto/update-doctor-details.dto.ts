import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class UpdateDoctorDetailsDto {
  @IsString()
  @IsOptional()
  specialization?: string;

  @IsNumber()
  @IsOptional()
  experience_years?: number;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsNumber()
  @IsOptional()
  consultation_fee?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  qualifications?: string[];
}
