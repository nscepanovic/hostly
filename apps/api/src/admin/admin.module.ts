import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({ controllers: [AdminAuthController, AdminController], providers: [AdminAuthService, AdminGuard, AdminService] })
export class AdminModule {}
