import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { UsersController } from './users.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: env().JWT_SECRET, signOptions: { expiresIn: `${env().JWT_TTL_HOURS}h` } }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
