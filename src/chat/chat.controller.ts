import {
  BadRequestException,
  Body,
  ConflictException,
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
import { type Conversation, ChatRepository } from './chat.repository.js';

const id = z.coerce.number().int().positive();
/** 첫 메시지는 편지로: 각자 대화방의 첫 메시지는 이 글자 수 이상 (#7 정책) */
export const LETTER_MIN_LENGTH = 40;
const readSchema = z.object({ messageId: id });

// 사람이 보는 글자 단위로 센다 (이모지·결합 문자도 1자)
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const charCount = (text: string) => [...segmenter.segment(text)].length;
const startSchema = z.object({ partnerId: id });
const sendSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const farewellSchema = z.object({ farewell: z.string().trim().min(1).max(500) });
const respondSchema = z.object({ accept: z.boolean() });
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
    const conversation = await this.requireOpen(conversationId, meId);
    await this.requireNotBlocked(conversation.userAId, conversation.userBId);
    if (charCount(body) < LETTER_MIN_LENGTH && !(await this.chat.hasSent(conversationId, meId))) {
      throw new BadRequestException(`First message must be a letter of at least ${LETTER_MIN_LENGTH} characters`);
    }
    const message = await this.chat.send(conversationId, meId, body);
    this.gateway.notifyMessage([conversation.userAId, conversation.userBId], message);
    return message;
  }

  /**
   * 진지한 인연 신청. 양쪽 모두 메시지를 1개 이상 주고받은 뒤에만.
   * 대기 중인 신청이 있으면 409, 내 신청이 거절된 적 있으면 다시 못 한다(상대는 가능).
   */
  // ponytail: 결제는 여기에 붙인다 (#7 — 진지함의 증명에 받는 돈). 지금은 무료.
  @Post(':id/serious')
  async requestSerious(@CurrentUser('id') meId: number, @Param('id', { schema: id }) conversationId: number) {
    const conversation = await this.requireOpen(conversationId, meId);
    await this.requireNotBlocked(conversation.userAId, conversation.userBId);
    if (conversation.seriousAt) throw new ConflictException('Already serious');
    const partnerId = this.partnerOf(conversation, meId);
    if (!(await this.chat.hasSent(conversationId, meId)) || !(await this.chat.hasSent(conversationId, partnerId))) {
      throw new BadRequestException('Both of you need to exchange messages first');
    }
    const requests = await this.chat.seriousRequests(conversationId);
    if (requests.some((r) => r.status === 'pending')) throw new ConflictException('A request is already pending');
    if (requests.some((r) => r.status === 'declined' && r.requesterId === meId)) {
      throw new ConflictException('Your request was declined');
    }
    const request = await this.chat.requestSerious(conversationId, meId);
    if (!request) throw new ConflictException('A request is already pending');
    this.gateway.notifyConversation([partnerId, meId], conversationId, 'serious:requested');
    return request;
  }

  @Post(':id/serious/respond')
  @HttpCode(200)
  async respondSerious(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) conversationId: number,
    @Body({ schema: respondSchema }) { accept }: z.infer<typeof respondSchema>,
  ) {
    const conversation = await this.requireOpen(conversationId, meId);
    const pending = (await this.chat.seriousRequests(conversationId)).find((r) => r.status === 'pending');
    // 받은 신청만 응답할 수 있다 (내가 보낸 신청에는 응답 불가)
    if (!pending || pending.requesterId === meId) throw new NotFoundException('No request to respond to');
    const seriousAt = await this.chat.respondSerious(pending.id, conversationId, accept);
    this.gateway.notifyConversation([conversation.userAId, conversation.userBId], conversationId, 'serious:updated');
    return { status: accept ? 'accepted' : 'declined', seriousAt };
  }

  /** 끝맺음 인사를 남기고 대화를 마친다. 닫힌 방은 다시 열 수 없다 */
  @Post(':id/close')
  async close(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) conversationId: number,
    @Body({ schema: farewellSchema }) { farewell }: z.infer<typeof farewellSchema>,
  ) {
    const conversation = await this.requireOpen(conversationId, meId);
    await this.requireNotBlocked(conversation.userAId, conversation.userBId);
    const message = await this.chat.close(conversationId, meId, farewell);
    this.gateway.notifyMessage([conversation.userAId, conversation.userBId], message);
    return message;
  }

  private partnerOf(conversation: Conversation, meId: number) {
    return conversation.userAId === meId ? conversation.userBId : conversation.userAId;
  }

  private async requireOpen(conversationId: number, meId: number) {
    const conversation = await this.requireMember(conversationId, meId);
    if (conversation.closedAt) throw new ConflictException('Conversation is closed');
    return conversation;
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
