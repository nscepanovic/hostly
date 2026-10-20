import { Injectable } from '@nestjs/common';
import type { WsEventPayloads } from '@hostly/shared';
import { RealtimeGateway, restaurantRoom } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emit<E extends keyof WsEventPayloads>(restaurantId: string, event: E, payload: WsEventPayloads[E]) {
    // The server is undefined in unit tests that do not start the HTTP adapter.
    this.gateway.server?.to(restaurantRoom(restaurantId)).emit(event, payload);
  }
}
