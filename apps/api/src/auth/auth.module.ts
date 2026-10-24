import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AccessGuard } from './access.guard';
import { CsrfGuard } from './csrf.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AccessGuard, CsrfGuard],
  exports: [SessionService, AccessGuard, CsrfGuard],
})
export class AuthModule {}
