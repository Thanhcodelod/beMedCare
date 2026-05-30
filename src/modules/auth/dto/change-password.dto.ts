import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  old_password: string;

  @ApiProperty({ description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}
