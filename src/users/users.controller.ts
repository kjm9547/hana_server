import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { MATCH_PREFERENCES } from '../db/schema.js';
import { SafetyRepository } from '../safety/safety.repository.js';
import { type User, UsersRepository } from './users.repository.js';

const updateMeSchema = z
  .object({
    nickname: z.string().trim().min(1).max(30),
    bio: z.string().trim().max(500),
    matchPreference: z.enum(MATCH_PREFERENCES),
  })
  .partial();
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  after: z.coerce.number().int().positive().optional(),
});

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly safety: SafetyRepository,
  ) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me')
  updateMe(@CurrentUser('id') id: number, @Body({ schema: updateMeSchema }) body: z.infer<typeof updateMeSchema>) {
    return this.users.update(id, body);
  }

  @Get('users')
  async partners(@CurrentUser() me: User, @Query({ schema: pageSchema }) q: z.infer<typeof pageSchema>) {
    return this.users.partners(me, q.limit, await this.safety.blockedEitherWay(me.id), q.after);
  }
}
