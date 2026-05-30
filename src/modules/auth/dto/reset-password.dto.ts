import { IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token from the email link' })
  @IsString()
  // base64url alphabet, length matches what AuthService.generateResetToken
  // produces (32 raw bytes → 43 chars).
  @Matches(/^[A-Za-z0-9_-]{32,128}$/, {
    message: 'Invalid token format',
  })
  token: string;

  @ApiProperty({ description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}
