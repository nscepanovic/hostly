import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { customerSchema, type CustomerDto, type CustomerInput } from '@hostly/shared';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CustomersService, type VisitDto } from './customers.service';

const listQuery = z.object({
  search: z.string().optional(),
  sort: z.enum(['lastName', 'firstName', 'phone', 'email', 'visits', 'createdAt']).default('lastName'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const suggestQuery = z.object({
  field: z.enum(['name', 'phone', 'email']),
  q: z.string().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.customers.list(user.restaurantId, q);
  }

  /** As-you-type guest suggestions for the reservation form. */
  @Get('suggest')
  suggest(@CurrentUser() user: AuthUser, @Query(new ZodPipe(suggestQuery)) q: z.infer<typeof suggestQuery>): Promise<CustomerDto[]> {
    return this.customers.suggest(user.restaurantId, q.field, q.q, q.limit);
  }

  /** Exact match on normalized phone for reservation-form autocomplete. */
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query('phone') phone = ''): Promise<CustomerDto | null> {
    return this.customers.lookupByPhone(user.restaurantId, phone);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    return this.customers.get(user.restaurantId, id);
  }

  @Get(':id/visits')
  visits(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VisitDto[]> {
    return this.customers.visits(user.restaurantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(customerSchema)) body: CustomerInput): Promise<CustomerDto> {
    return this.customers.create(user.restaurantId, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(customerSchema)) body: CustomerInput,
  ): Promise<CustomerDto> {
    return this.customers.update(user.restaurantId, id, body);
  }
}
