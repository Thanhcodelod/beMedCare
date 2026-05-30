import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EmergencyContactDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string;
}

export class UpdatePatientDetailsDto {
  @IsString()
  @IsOptional()
  @MaxLength(10)
  blood_type?: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  allergies?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  medical_history?: string;

  // Typed nested object instead of `any` — ValidationPipe now enforces the
  // exact shape (name/phone/relationship) and rejects arbitrary JSON blobs.
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergency_contact?: EmergencyContactDto;
}
