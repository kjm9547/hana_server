import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { conversations, introductions, users } from '../db/schema.js';
import { publicCols, type User } from '../users/users.repository.js';

export const DAILY_INTRODUCTIONS = 3;

const introCols = {
  id: introductions.id,
  status: introductions.status,
  conversationId: introductions.conversationId,
  candidate: publicCols,
};

@Injectable()
export class IntroductionsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * 오늘의 소개. 그날 처음 부를 때 후보를 뽑아 저장하고, 같은 날엔 같은 결과를 돌려준다.
   * 후보가 하나도 없던 날은 다음 호출 때 다시 뽑아본다 (그 사이 가입자가 생길 수 있다).
   */
  async today(me: User, date: string, excludeIds: number[]) {
    return this.db.transaction(async (tx) => {
      // 같은 유저의 동시 요청이 각자 3명씩 뽑지 않게 유저 단위로 잠근다
      await tx.execute(sql`select pg_advisory_xact_lock(${me.id})`);
      const existing = await this.forDate(tx, me.id, date);
      if (existing.length) return existing;

      const alreadyIntroduced = tx
        .select({ id: introductions.candidateId })
        .from(introductions)
        .where(eq(introductions.userId, me.id));
      const talkingWith = tx
        .select({
          id: sql<number>`case when ${conversations.userAId} = ${me.id} then ${conversations.userBId} else ${conversations.userAId} end`,
        })
        .from(conversations)
        .where(or(eq(conversations.userAId, me.id), eq(conversations.userBId, me.id)));

      const candidates = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            ne(users.id, me.id),
            sql`${users.id} not in ${alreadyIntroduced}`,
            sql`${users.id} not in ${talkingWith}`,
            excludeIds.length ? notInArray(users.id, excludeIds) : undefined,
            // 내가 한·일만 원하면 다른 언어만, 상대가 한·일만 원하면 나도 다른 언어여야 한다
            me.matchPreference === 'cross' ? ne(users.nativeLang, me.nativeLang) : undefined,
            or(eq(users.matchPreference, 'any'), ne(users.nativeLang, me.nativeLang)),
          ),
        )
        .orderBy(sql`random()`)
        .limit(DAILY_INTRODUCTIONS);
      if (!candidates.length) return [];

      await tx
        .insert(introductions)
        .values(candidates.map((c) => ({ userId: me.id, candidateId: c.id, date })))
        .onConflictDoNothing();
      return this.forDate(tx, me.id, date);
    });
  }

  /** 오늘 받은 소개 중 내 것만. 지난 날의 소개는 사라진 것으로 본다 */
  async findTodayForUser(id: number, userId: number, date: string) {
    const [row] = await this.db
      .select({ candidateId: introductions.candidateId, ...introCols })
      .from(introductions)
      .innerJoin(users, eq(users.id, introductions.candidateId))
      .where(and(eq(introductions.id, id), eq(introductions.userId, userId), eq(introductions.date, date)));
    return row ?? null;
  }

  async pass(id: number) {
    await this.db.update(introductions).set({ status: 'passed' }).where(eq(introductions.id, id));
  }

  async accept(id: number, conversationId: number) {
    await this.db.update(introductions).set({ status: 'accepted', conversationId }).where(eq(introductions.id, id));
  }

  private forDate(db: Pick<Database, 'select'>, userId: number, date: string) {
    return db
      .select(introCols)
      .from(introductions)
      .innerJoin(users, eq(users.id, introductions.candidateId))
      .where(and(eq(introductions.userId, userId), eq(introductions.date, date)))
      .orderBy(asc(introductions.id));
  }
}
