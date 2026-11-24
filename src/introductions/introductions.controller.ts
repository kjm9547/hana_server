import { ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { ChatRepository } from '../chat/chat.repository.js';
import { Clock } from '../common/clock.js';
import { SafetyRepository } from '../safety/safety.repository.js';
import type { User } from '../users/users.repository.js';
import { IntroductionsRepository } from './introductions.repository.js';

const id = z.coerce.number().int().positive();

@Controller('introductions')
export class IntroductionsController {
  constructor(
    private readonly intros: IntroductionsRepository,
    private readonly chat: ChatRepository,
    private readonly safety: SafetyRepository,
    private readonly clock: Clock,
  ) {}

  @Get('today')
  async today(@CurrentUser() me: User) {
    const items = await this.intros.today(me, this.clock.today(), await this.safety.blockedEitherWay(me.id));
    return { date: this.clock.today(), items };
  }

  /** 넘기기: 이 사람은 다시 소개되지 않는다 */
  @Post(':id/pass')
  async pass(@CurrentUser('id') meId: number, @Param('id', { schema: id }) introId: number) {
    const intro = await this.requireToday(introId, meId);
    if (intro.status !== 'pending') throw new ConflictException('Already handled');
    await this.intros.pass(introId);
    return { id: introId, status: 'passed' };
  }

  /** 대화 시작: 대화방을 만들고 돌려준다. 이미 수락했으면 같은 방 */
  @Post(':id/accept')
  async accept(@CurrentUser('id') meId: number, @Param('id', { schema: id }) introId: number) {
    const intro = await this.requireToday(introId, meId);
    if (intro.status === 'passed') throw new ConflictException('Already passed');
    if (await this.safety.isBlockedEitherWay(meId, intro.candidateId)) {
      throw new ForbiddenException('You cannot message this user');
    }
    const conversation = await this.chat.getOrCreate(meId, intro.candidateId);
    await this.intros.accept(introId, conversation.id);
    return { conversation: { id: conversation.id, partner: intro.candidate } };
  }

  private async requireToday(introId: number, meId: number) {
    const intro = await this.intros.findTodayForUser(introId, meId, this.clock.today());
    if (!intro) throw new NotFoundException('Introduction not found');
    return intro;
  }
}
