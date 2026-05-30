import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';

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
}
