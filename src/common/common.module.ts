import { Global, Module } from '@nestjs/common';
import { IdentityService } from './services/identity.service';

@Global()
@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class CommonModule {}
