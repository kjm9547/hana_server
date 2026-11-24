import { WsAuthenticator } from '@nestjs/authentication';
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { User } from '../users/users.repository.js';
import type { Message } from './chat.repository.js';

const userRoom = (userId: number) => `user:${userId}`;

/**
 * 받기 전용 실시간 채널. 보내기는 REST(POST /conversations/:id/messages)로 하고, 여기서는 푸시만 한다.
 * 클라이언트는 `io(url, { auth: { token } })`로 연결하고, 인증에 실패하면 서버가 연결을 끊는다.
 */
// ponytail: 인증은 연결할 때 한 번. 탈퇴·정지가 생기면 그 유저의 소켓도 끊어야 한다 (nestjs-auth: Streams authenticate once).
@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() private readonly server: Server;

  constructor(private readonly wsAuth: WsAuthenticator) {}

  async handleConnection(client: Socket) {
    const result = await this.wsAuth.authenticateConnection(client);
    // user는 JwtAuth.validate()가 DB에서 읽은 User (WsAuthenticator는 타입을 모른다)
    if (result) await client.join(userRoom((result.user as User).id));
  }

  notifyMessage(userIds: number[], message: Message) {
    this.server.to(userIds.map(userRoom)).emit('message:new', { conversationId: message.conversationId, message });
  }
}
