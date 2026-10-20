import { Module } from '@nestjs/common';
import { FloorPlanController } from './floorplan.controller';
import { FloorPlanService } from './floorplan.service';

@Module({ controllers: [FloorPlanController], providers: [FloorPlanService], exports: [FloorPlanService] })
export class FloorPlanModule {}
