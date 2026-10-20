import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
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
    await socket.join(restaurantRoom(user.restaurantId));
    this.logger.debug(`socket ${socket.id} joined ${user.restaurantId}`);
  }
}
