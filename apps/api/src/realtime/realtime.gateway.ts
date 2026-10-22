import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../auth/auth.constants';
import { env } from '../config/env';

export const restaurantRoom = (restaurantId: string) => `restaurant:${restaurantId}`;

@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: env().CORS_ORIGIN.split(','), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly auth: AuthService) {}

  /** Open tablet/browser connections per restaurant id (admin monitoring). */
  connectedByRestaurant(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [room, sockets] of this.server?.sockets.adapter.rooms ?? []) {
      if (room.startsWith('restaurant:')) out.set(room.slice('restaurant:'.length), sockets.size);
    }
    return out;
  }

  /**
   * Devices that have Hostly on screen right now. They get in-app pop-ups, so
   * push notifications skip them. Hidden apps report it and disconnect soon after.
   */
  visibleDevices(restaurantId: string): Set<string> {
    const out = new Set<string>();
    const ids = this.server?.sockets.adapter.rooms.get(restaurantRoom(restaurantId)) ?? new Set<string>();
    for (const id of ids) {
      const s = this.server.sockets.sockets.get(id);
      if (s?.data.deviceId && s.data.visible) out.add(s.data.deviceId as string);
    }
    return out;
  }

  /** The app was hidden or shown again (tablet asleep, other app in front). */
  @SubscribeMessage('presence')
  presence(@ConnectedSocket() socket: Socket, @MessageBody() body: { visible?: unknown }) {
    socket.data.visible = body?.visible !== false;
  }

  /** Drops every live connection of a restaurant (used on suspension). */
  disconnectRestaurant(restaurantId: string) {
    this.server?.in(restaurantRoom(restaurantId)).disconnectSockets(true);
  }

  /** Authenticates with the session cookie and joins the restaurant's room. */
  async handleConnection(socket: Socket) {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const token = cookies[SESSION_COOKIE];
    const user = token ? await this.auth.verify(token) : null;
    if (!user) {
      socket.emit('auth.error');
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    const auth = (socket.handshake.auth ?? {}) as { deviceId?: unknown; visible?: unknown };
    socket.data.deviceId = typeof auth.deviceId === 'string' ? auth.deviceId.slice(0, 64) : null;
    socket.data.visible = auth.visible !== false;
    await socket.join(restaurantRoom(user.restaurantId));
    this.logger.debug(`socket ${socket.id} joined ${user.restaurantId}`);
  }
}
