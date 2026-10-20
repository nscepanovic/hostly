import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  areaSchema,
  floorPlanSaveSchema,
  joinGroupSchema,
  type AreaDto,
  type AreaInput,
  type FloorPlanSaveInput,
  type JoinGroupDto,
  type JoinGroupInput,
  type TableDto,
} from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { FloorPlanService } from './floorplan.service';
import { toAreaDto, toJoinGroupDto, toTableDto } from './floorplan.mappers';

@Controller()
export class FloorPlanController {
  constructor(
    private readonly floor: FloorPlanService,
    private readonly realtime: RealtimeService,
  ) {}

  private changed(user: AuthUser, areaId?: string) {
    this.realtime.emit(user.restaurantId, 'floorplan.updated', { areaId });
  }

  @Get('areas')
  async areas(@CurrentUser() user: AuthUser): Promise<AreaDto[]> {
    return (await this.floor.listAreas(user.restaurantId)).map(toAreaDto);
  }

  @Post('areas')
  @Roles('owner')
  async createArea(@CurrentUser() user: AuthUser, @Body(new ZodPipe(areaSchema)) body: AreaInput): Promise<AreaDto> {
    const row = await this.floor.createArea(user.restaurantId, body);
    this.changed(user, row.id);
    return toAreaDto(row);
  }

  @Patch('areas/:id')
  @Roles('owner')
  async updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(areaSchema)) body: AreaInput,
  ): Promise<AreaDto> {
    const row = await this.floor.updateArea(user.restaurantId, id, body);
    this.changed(user, id);
    return toAreaDto(row);
  }

  @Delete('areas/:id')
  @Roles('owner')
  @HttpCode(204)
  async deleteArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.floor.deleteArea(user.restaurantId, id);
    this.changed(user, id);
  }

  @Get('tables')
  async tables(@CurrentUser() user: AuthUser): Promise<TableDto[]> {
    return (await this.floor.listTables(user.restaurantId)).map(toTableDto);
  }

  @Put('floor-plan')
  @Roles('owner')
  async save(@CurrentUser() user: AuthUser, @Body(new ZodPipe(floorPlanSaveSchema)) body: FloorPlanSaveInput): Promise<TableDto[]> {
    const rows = await this.floor.saveFloorPlan(user.restaurantId, body);
    this.changed(user, body.areaId);
    return rows.map(toTableDto);
  }

  @Get('join-groups')
  async joinGroups(@CurrentUser() user: AuthUser): Promise<JoinGroupDto[]> {
    return (await this.floor.listJoinGroups(user.restaurantId)).map(toJoinGroupDto);
  }

  @Post('join-groups')
  @Roles('owner')
  async createJoinGroup(@CurrentUser() user: AuthUser, @Body(new ZodPipe(joinGroupSchema)) body: JoinGroupInput): Promise<JoinGroupDto> {
    const row = await this.floor.createJoinGroup(user.restaurantId, body);
    this.changed(user);
    return toJoinGroupDto(row);
  }

  @Put('join-groups/:id')
  @Roles('owner')
  async updateJoinGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(joinGroupSchema)) body: JoinGroupInput,
  ): Promise<JoinGroupDto> {
    const row = await this.floor.updateJoinGroup(user.restaurantId, id, body);
    this.changed(user);
    return toJoinGroupDto(row);
  }

  @Delete('join-groups/:id')
  @Roles('owner')
  @HttpCode(204)
  async deleteJoinGroup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.floor.deleteJoinGroup(user.restaurantId, id);
    this.changed(user);
  }
}
