import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHealthMetricDto {
  @ApiProperty({ example: 70, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  weight?: number;

  @ApiProperty({ example: 175, required: false })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  height?: number;

  @ApiProperty({ example: 72, required: false })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(250)
  heart_rate?: number;

  @ApiProperty({ example: '120/80', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}\/\d{2,3}$/, {
    message: 'blood_pressure must be like "120/80"',
  })
  blood_pressure?: string;

  @ApiProperty({ example: 36.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number;

  @ApiProperty({ example: 22.8, required: false })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(80)
  bmi?: number;
}
