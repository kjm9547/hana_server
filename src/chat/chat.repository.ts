import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { conversations, messages, users } from '../db/schema.js';
import { publicCols } from '../users/users.repository.js';

const messageCols = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  body: messages.body,
  createdAt: messages.createdAt,
};

export type Message = { id: number; conversationId: number; senderId: number; body: string; createdAt: Date };
type Conversation = { id: number; userAId: number; userBId: number };

const pair = (x: number, y: number) => (x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x });

@Injectable()
export class ChatRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** 두 사람의 대화방을 가져오거나 만든다. 동시에 만들어도 unique 제약으로 하나만 남는다. */
  async getOrCreate(meId: number, partnerId: number): Promise<Conversation> {
    const ids = pair(meId, partnerId);
    const [created] = await this.db
      .insert(conversations)
      .values(ids)
      .onConflictDoNothing({ target: [conversations.userAId, conversations.userBId] })
      .returning({ id: conversations.id, userAId: conversations.userAId, userBId: conversations.userBId });
    if (created) return created;
    const [existing] = await this.db
      .select({ id: conversations.id, userAId: conversations.userAId, userBId: conversations.userBId })
      .from(conversations)
      .where(and(eq(conversations.userAId, ids.userAId), eq(conversations.userBId, ids.userBId)));
    return existing;
  }

  /** 내가 참여한 대화방만 돌려준다. 남의 방이면 null → 호출부에서 404 (존재 여부도 숨긴다). */
  async findForMember(conversationId: number, meId: number): Promise<Conversation | null> {
    const [row] = await this.db
      .select({ id: conversations.id, userAId: conversations.userAId, userBId: conversations.userBId })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), or(eq(conversations.userAId, meId), eq(conversations.userBId, meId))),
      );
    return row ?? null;
  }

  /** 내 대화방 목록: 상대 공개 프로필 + 마지막 메시지, 최근 활동순. */
  // ponytail: 페이징 없음. 대화방이 수백 개 쌓이는 유저가 생기면 last_message_at 커서로.
  async list(meId: number) {
    const partnerId = sql<number>`case when ${conversations.userAId} = ${meId} then ${conversations.userBId} else ${conversations.userAId} end`;
    const rows = await this.db
      .select({ id: conversations.id, partner: publicCols })
      .from(conversations)
      .innerJoin(users, eq(users.id, partnerId))
      .where(or(eq(conversations.userAId, meId), eq(conversations.userBId, meId)))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id));
    if (rows.length === 0) return [];

    const last = await this.db
      .selectDistinctOn([messages.conversationId], messageCols)
      .from(messages)
      .where(
        inArray(
          messages.conversationId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(messages.conversationId, desc(messages.id));
    const lastByConversation = new Map(last.map((m) => [m.conversationId, m]));
    return rows.map((r) => ({ ...r, lastMessage: lastByConversation.get(r.id) ?? null }));
  }

  /** 최신순. before(메시지 id)보다 오래된 것을 limit개. limit+1개를 읽어 다음 페이지 유무를 판단. */
  async messages(conversationId: number, limit: number, before?: number) {
    const rows = await this.db
      .select(messageCols)
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), before ? lt(messages.id, before) : undefined))
      .orderBy(desc(messages.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  async send(conversationId: number, senderId: number, body: string): Promise<Message> {
    return this.db.transaction(async (tx) => {
      const [message] = await tx.insert(messages).values({ conversationId, senderId, body }).returning(messageCols);
      await tx
        .update(conversations)
        .set({ lastMessageAt: message.createdAt })
        .where(eq(conversations.id, conversationId));
      return message;
    });
  }
}
