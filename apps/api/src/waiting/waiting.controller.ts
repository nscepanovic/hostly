import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import { waitingEntrySchema, waitingPatchSchema, type WaitingEntryDto, type WaitingEntryInput, type WaitingPatchInput } from '@hostly/shared';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReservationsService } from '../reservations/reservations.service';
import { WaitingService } from './waiting.service';

@Controller('waiting')
export class WaitingController {
  constructor(
    private readonly waiting: WaitingService,
    private readonly reservations: ReservationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WaitingEntryDto[]> {
    return this.waiting.list(user.restaurantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(waitingEntrySchema)) body: WaitingEntryInput): Promise<WaitingEntryDto> {
    return this.waiting.create(user.restaurantId, body);
  }

  /** Status/notified changes; with `tableIds` the party is seated as a walk-in reservation. */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(waitingPatchSchema)) body: WaitingPatchInput,
  ): Promise<WaitingEntryDto> {
    if (body.status === 'seated') {
      const entry = await this.waiting.get(user.restaurantId, id);
      const [firstName, ...rest] = entry.guestName.split(' ');
      await this.reservations.create(user, {
        status: 'seated',
        purpose: 'food',
        arrivalAt: DateTime.now().toISO()!,
        departureAt: null,
        covers: entry.covers,
        firstName,
        lastName: rest.join(' ') || null,
        phone: entry.phone,
        email: null,
        customerId: null,
        areaId: null,
        tableIds: body.tableIds ?? [],
        source: 'walk_in',
        notes: entry.notes,
        tags: [],
        dietary: [],
        fixMenu: false,
        language: null,
        birthday: null,
        extras: {},
        spend: null,
        force: true,
      });
    }
    return this.waiting.update(user.restaurantId, id, body);
  }
}
