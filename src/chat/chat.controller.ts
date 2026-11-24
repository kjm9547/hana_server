import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { SafetyRepository } from '../safety/safety.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatRepository } from './chat.repository.js';

const id = z.coerce.number().int().positive();
/** 첫 메시지는 편지로: 각자 대화방의 첫 메시지는 이 글자 수 이상 (#7 정책) */
export const LETTER_MIN_LENGTH = 40;
const readSchema = z.object({ messageId: id });
const startSchema = z.object({ partnerId: id });
const sendSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: id.optional(),
});

@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatRepository,
    private readonly users: UsersRepository,
    private readonly gateway: ChatGateway,
    private readonly safety: SafetyRepository,
  ) {}

  @Post()
  async start(
    @CurrentUser('id') meId: number,
    @Body({ schema: startSchema }) { partnerId }: z.infer<typeof startSchema>,
  ) {
    if (partnerId === meId) throw new BadRequestException('Cannot start a conversation with yourself');
    const partner = await this.users.findPublicById(partnerId);
    if (!partner) throw new NotFoundException('User not found');
    await this.requireNotBlocked(meId, partnerId);
    const conversation = await this.chat.getOrCreate(meId, partnerId);
    return { id: conversation.id, partner };
  }

  @Get()
  async list(@CurrentUser('id') meId: number) {
    // 내가 차단한 상대와의 방은 숨긴다. 상대가 나를 차단한 방은 보이되 보낼 수 없다
    return { items: await this.chat.list(meId, await this.safety.blockedIdsBy(meId)) };
  }

  @Get(':id')
  async room(@CurrentUser('id') meId: number, @Param('id', { schema: id }) conversationId: number) {
    return this.chat.room(await this.requireMember(conversationId, meId), meId);
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) conversationId: number,
    @Body({ schema: readSchema }) { messageId }: z.infer<typeof readSchema>,
  ) {
    const conversation = await this.requireMember(conversationId, meId);
    const lastReadMessageId = await this.chat.markRead(conversationId, meId, messageId);
    if (lastReadMessageId === null) throw new NotFoundException('Message not found');
    this.gateway.notifyRead([conversation.userAId, conversation.userBId], {
      conversationId,
      userId: meId,
      lastReadMessageId,
    });
    return { lastReadMessageId };
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) conversationId: number,
    @Query({ schema: pageSchema }) q: z.infer<typeof pageSchema>,
  ) {
    await this.requireMember(conversationId, meId);
    return this.chat.messages(conversationId, q.limit, q.before);
  }

  @Post(':id/messages')
  async send(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) conversationId: number,
    @Body({ schema: sendSchema }) { body }: z.infer<typeof sendSchema>,
  ) {
    const conversation = await this.requireMember(conversationId, meId);
    await this.requireNotBlocked(conversation.userAId, conversation.userBId);
    // 글자 수는 코드포인트 기준 (이모지 하나 = 1자)
    if ([...body].length < LETTER_MIN_LENGTH && !(await this.chat.hasSent(conversationId, meId))) {
      throw new BadRequestException(`First message must be a letter of at least ${LETTER_MIN_LENGTH} characters`);
    }
    const message = await this.chat.send(conversationId, meId, body);
    this.gateway.notifyMessage([conversation.userAId, conversation.userBId], message);
    return message;
  }

  private async requireNotBlocked(a: number, b: number) {
    if (await this.safety.isBlockedEitherWay(a, b)) throw new ForbiddenException('You cannot message this user');
  }

  private async requireMember(conversationId: number, meId: number) {
    const conversation = await this.chat.findForMember(conversationId, meId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
