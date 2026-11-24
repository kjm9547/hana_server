import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, or } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { blocks, type REPORT_REASONS, reports, users } from '../db/schema.js';
import { publicCols } from '../users/users.repository.js';

@Injectable()
export class SafetyRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async block(blockerId: number, blockedId: number) {
    await this.db.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing();
  }

  async unblock(blockerId: number, blockedId: number) {
    await this.db.delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
  }

  /** 내가 차단한 사람들 (차단 해제 화면용), 최근순 */
  async blockedBy(blockerId: number) {
    return this.db
      .select({ ...publicCols, blockedAt: blocks.createdAt })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, blockerId))
      .orderBy(desc(blocks.createdAt));
  }

  /** 어느 쪽이든 차단 관계인지 */
  async isBlockedEitherWay(a: number, b: number) {
    const [row] = await this.db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
          and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
        ),
      )
      .limit(1);
    return !!row;
  }

  /** 나와 차단 관계인 모든 사람 (내가 막았든 상대가 막았든). 소개·목록에서 뺄 때 쓴다 */
  async blockedEitherWay(meId: number): Promise<number[]> {
    const rows = await this.db
      .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
      .from(blocks)
      .where(or(eq(blocks.blockerId, meId), eq(blocks.blockedId, meId)));
    return rows.map((r) => (r.blockerId === meId ? r.blockedId : r.blockerId));
  }

  /** 내가 차단한 사람만. 차단한 쪽의 대화 목록에서 숨길 때 쓴다 */
  async blockedIdsBy(meId: number): Promise<number[]> {
    const rows = await this.db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, meId));
    return rows.map((r) => r.id);
  }

  /** 신고하면 자동으로 차단한다 (한 트랜잭션) */
  async report(data: {
    reporterId: number;
    reportedId: number;
    reason: (typeof REPORT_REASONS)[number];
    detail: string;
    conversationId: number | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [report] = await tx.insert(reports).values(data).returning({ id: reports.id });
      await tx.insert(blocks).values({ blockerId: data.reporterId, blockedId: data.reportedId }).onConflictDoNothing();
      return report;
    });
  }
}
