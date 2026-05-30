import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TeleconsultationController } from './teleconsultation.controller';
import { TeleconsultationGateway } from './teleconsultation.gateway';
import { WsRateLimiter } from './ws-rate-limiter.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [TeleconsultationController],
  providers: [TeleconsultationGateway, WsRateLimiter],
})
export class TeleconsultationModule {}
