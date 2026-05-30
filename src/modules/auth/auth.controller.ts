import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt.guard';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // 5 registrations / hour / IP — slow down sign-up flooding.
  @Throttle({ sensitive: { limit: 5, ttl: seconds(60 * 60) } })
  @ApiOperation({ summary: 'Register a new patient account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register/doctor')
  @Throttle({ sensitive: { limit: 5, ttl: seconds(60 * 60) } })
  @ApiOperation({
    summary: 'Register a doctor account (pending admin approval)',
  })
  registerDoctor(@Body() dto: RegisterDoctorDto) {
    return this.authService.registerDoctor(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 5 attempts / minute / IP — defends against credential brute force.
  @Throttle({ auth: { limit: 5, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Login with email + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  logout(@GetUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  // 5 attempts / 10min / IP. Authenticated route, but IP-bucket still
  // protects against stolen-token mass-rotation.
  @Throttle({ auth: { limit: 5, ttl: seconds(10 * 60) } })
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Authenticated user changes own password. All existing sessions are revoked.',
  })
  changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  // Strict: 3 / 15min / IP. Forgot-password is the most-abused endpoint —
  // attackers spam it for enumeration or to flood inboxes.
  @Throttle({ sensitive: { limit: 3, ttl: seconds(15 * 60) } })
  @ApiOperation({
    summary:
      'Request a password-reset link by email. Always returns the same message regardless of account existence.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  // 10 / 15min / IP — generous enough for legitimate retries on form
  // mistakes, tight enough to deter token-guessing.
  @Throttle({ sensitive: { limit: 10, ttl: seconds(15 * 60) } })
  @ApiOperation({
    summary:
      'Submit a reset token + new password. The token is single-use and expires after 15 minutes.',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
