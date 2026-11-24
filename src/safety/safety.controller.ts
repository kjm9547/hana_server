import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { ChatRepository } from '../chat/chat.repository.js';
import { REPORT_REASONS } from '../db/schema.js';
import { UsersRepository } from '../users/users.repository.js';
import { SafetyRepository } from './safety.repository.js';

const id = z.coerce.number().int().positive();
const reportSchema = z.object({
  userId: id,
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(1000).default(''),
  conversationId: id.optional(),
});

@Controller()
export class SafetyController {
  constructor(
    private readonly safety: SafetyRepository,
    private readonly users: UsersRepository,
    private readonly chat: ChatRepository,
  ) {}

  @Post('users/:id/block')
  @HttpCode(204)
  async block(@CurrentUser('id') meId: number, @Param('id', { schema: id }) userId: number) {
    await this.requireOtherUser(meId, userId);
    await this.safety.block(meId, userId);
  }

  @Delete('users/:id/block')
  @HttpCode(204)
  async unblock(@CurrentUser('id') meId: number, @Param('id', { schema: id }) userId: number) {
    await this.safety.unblock(meId, userId);
  }

  @Get('blocks')
  async blocks(@CurrentUser('id') meId: number) {
    return { items: await this.safety.blockedBy(meId) };
  }

  @Post('reports')
  async report(@CurrentUser('id') meId: number, @Body({ schema: reportSchema }) body: z.infer<typeof reportSchema>) {
    await this.requireOtherUser(meId, body.userId);
    if (body.conversationId) {
      // 신고 근거로 붙이는 대화방은 내가 그 상대와 함께 있는 방이어야 한다
      const conversation = await this.chat.findForMember(body.conversationId, meId);
      if (!conversation || ![conversation.userAId, conversation.userBId].includes(body.userId)) {
        throw new NotFoundException('Conversation not found');
      }
    }
    return this.safety.report({
      reporterId: meId,
      reportedId: body.userId,
      reason: body.reason,
      detail: body.detail,
      conversationId: body.conversationId ?? null,
    });
  }

  private async requireOtherUser(meId: number, userId: number) {
    if (userId === meId) throw new BadRequestException('Cannot do this to yourself');
    if (!(await this.users.findPublicById(userId))) throw new NotFoundException('User not found');
  }
}
