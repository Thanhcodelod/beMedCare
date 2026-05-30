import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateMedicalRecordDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  diagnosis?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  diagnostic_code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  treatment?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  prescription?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  doctor_advice?: string;
}
