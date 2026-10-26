import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [UsersController, PrivacyController],
  providers: [UsersService, PrivacyService],
})
export class UsersModule {}
