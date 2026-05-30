import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    example: 'uuid-cua-cuoc-hen',
    description: 'ID cuộc hẹn đã hoàn thành',
  })
  @IsNotEmpty()
  @IsUUID()
  appointment_id: string;

  @ApiProperty({ example: 5, description: 'Số sao từ 1 đến 5' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    example: 'Bác sĩ rất tận tâm!',
    description: 'Nội dung nhận xét',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}
