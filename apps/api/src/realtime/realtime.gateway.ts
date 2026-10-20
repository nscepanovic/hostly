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
