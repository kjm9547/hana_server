import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, desc, eq, gt, inArray, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  conversationReads,
  conversations,
  type MESSAGE_KINDS,
  messages,
  seriousRequests,
  users,
} from '../db/schema.js';
import { isUniqueViolation, publicCols } from '../users/users.repository.js';

const messageCols = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  body: messages.body,
  kind: messages.kind,
  createdAt: messages.createdAt,
};

const conversationCols = {
  id: conversations.id,
  userAId: conversations.userAId,
  userBId: conversations.userBId,
  seriousAt: conversations.seriousAt,
  closedAt: conversations.closedAt,
  closedBy: conversations.closedBy,
};

export type MessageKind = (typeof MESSAGE_KINDS)[number];
export type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  kind: MessageKind;
  createdAt: Date;
};
export type Conversation = {
  id: number;
  userAId: number;
  userBId: number;
  seriousAt: Date | null;
  closedAt: Date | null;
  closedBy: number | null;
};

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
      .returning(conversationCols);
    if (created) return created;
    const [existing] = await this.db
      .select(conversationCols)
      .from(conversations)
      .where(and(eq(conversations.userAId, ids.userAId), eq(conversations.userBId, ids.userBId)));
    return existing;
  }

  /** 내가 참여한 대화방만 돌려준다. 남의 방이면 null → 호출부에서 404 (존재 여부도 숨긴다). */
  async findForMember(conversationId: number, meId: number): Promise<Conversation | null> {
    const [row] = await this.db
      .select(conversationCols)
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), or(eq(conversations.userAId, meId), eq(conversations.userBId, meId))),
      );
    return row ?? null;
  }

  /** 내 대화방 목록: 상대 공개 프로필 + 마지막 메시지, 최근 활동순. */
  // ponytail: 페이징 없음. 대화방이 수백 개 쌓이는 유저가 생기면 last_message_at 커서로.
  async list(meId: number, hiddenPartnerIds: number[] = []) {
    const partnerId = sql<number>`case when ${conversations.userAId} = ${meId} then ${conversations.userBId} else ${conversations.userAId} end`;
    const rows = await this.db
      .select({
        id: conversations.id,
        partner: publicCols,
        seriousAt: conversations.seriousAt,
        closedAt: conversations.closedAt,
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, partnerId))
      .where(
        and(
          or(eq(conversations.userAId, meId), eq(conversations.userBId, meId)),
          hiddenPartnerIds.length ? notInArray(users.id, hiddenPartnerIds) : undefined,
        ),
      )
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

    // 안 읽은 수: 상대가 보낸 메시지 중 내가 읽은 위치보다 뒤에 있는 것
    const unread = await this.db
      .select({ conversationId: messages.conversationId, count: count() })
      .from(messages)
      .leftJoin(
        conversationReads,
        and(eq(conversationReads.conversationId, messages.conversationId), eq(conversationReads.userId, meId)),
      )
      .where(
        and(
          inArray(
            messages.conversationId,
            rows.map((r) => r.id),
          ),
          ne(messages.senderId, meId),
          gt(messages.id, sql`coalesce(${conversationReads.lastReadMessageId}, 0)`),
        ),
      )
      .groupBy(messages.conversationId);
    const unreadByConversation = new Map(unread.map((u) => [u.conversationId, u.count]));

    return rows.map((r) => ({
      ...r,
      lastMessage: lastByConversation.get(r.id) ?? null,
      unreadCount: unreadByConversation.get(r.id) ?? 0,
    }));
  }

  /** 채팅방 화면에 필요한 정보: 상대, 각자 읽은 위치, 내가 아직 첫 메시지(편지)를 안 보냈는지 */
  async room(conversation: Conversation, meId: number) {
    const partnerId = conversation.userAId === meId ? conversation.userBId : conversation.userAId;
    const [partner] = await this.db.select(publicCols).from(users).where(eq(users.id, partnerId));
    const reads = await this.db
      .select({ userId: conversationReads.userId, lastReadMessageId: conversationReads.lastReadMessageId })
      .from(conversationReads)
      .where(eq(conversationReads.conversationId, conversation.id));
    const readOf = (userId: number) => reads.find((r) => r.userId === userId)?.lastReadMessageId ?? null;
    const requests = await this.seriousRequests(conversation.id);
    const pending = requests.find((r) => r.status === 'pending');
    return {
      id: conversation.id,
      partner,
      myLastReadMessageId: readOf(meId),
      partnerLastReadMessageId: readOf(partnerId),
      needsLetter: !(await this.hasSent(conversation.id, meId)),
      seriousAt: conversation.seriousAt,
      // 대기 중인 신청: 내가 보냈는지(기다리는 중) / 받았는지(응답해야 함)
      seriousRequest: pending ? { id: pending.id, requestedByMe: pending.requesterId === meId } : null,
      closedAt: conversation.closedAt,
      closedByMe: conversation.closedBy === meId,
    };
  }

  /** 이 방의 진지한 인연 신청들, 최근순 */
  async seriousRequests(conversationId: number) {
    return this.db
      .select({ id: seriousRequests.id, requesterId: seriousRequests.requesterId, status: seriousRequests.status })
      .from(seriousRequests)
      .where(eq(seriousRequests.conversationId, conversationId))
      .orderBy(desc(seriousRequests.id));
  }

  /** 이미 대기 중인 신청이 있으면(동시 신청 포함) null */
  async requestSerious(conversationId: number, requesterId: number) {
    try {
      const [request] = await this.db.insert(seriousRequests).values({ conversationId, requesterId }).returning({
        id: seriousRequests.id,
        requesterId: seriousRequests.requesterId,
        status: seriousRequests.status,
      });
      return request;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** 수락하면 대화방에 진지한 인연 시각을 남긴다 */
  async respondSerious(requestId: number, conversationId: number, accept: boolean) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(seriousRequests)
        .set({ status: accept ? 'accepted' : 'declined', respondedAt: now })
        .where(eq(seriousRequests.id, requestId));
      if (accept) await tx.update(conversations).set({ seriousAt: now }).where(eq(conversations.id, conversationId));
      return accept ? now : null;
    });
  }

  /** 끝맺음 인사를 남기고 방을 닫는다 (한 트랜잭션) */
  async close(conversationId: number, userId: number, farewell: string): Promise<Message> {
    return this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({ conversationId, senderId: userId, body: farewell, kind: 'farewell' })
        .returning(messageCols);
      await tx
        .update(conversations)
        .set({ closedAt: message.createdAt, closedBy: userId, lastMessageAt: message.createdAt })
        .where(eq(conversations.id, conversationId));
      return message;
    });
  }

  async hasSent(conversationId: number, senderId: number) {
    const [row] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, senderId)))
      .limit(1);
    return !!row;
  }

  /** 읽은 위치를 올린다 (내려가지 않음). 그 방의 메시지가 아니면 null */
  async markRead(conversationId: number, userId: number, messageId: number): Promise<number | null> {
    const [message] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));
    if (!message) return null;
    const [row] = await this.db
      .insert(conversationReads)
      .values({ conversationId, userId, lastReadMessageId: messageId })
      .onConflictDoUpdate({
        target: [conversationReads.conversationId, conversationReads.userId],
        set: {
          lastReadMessageId: sql`greatest(${conversationReads.lastReadMessageId}, excluded.last_read_message_id)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ lastReadMessageId: conversationReads.lastReadMessageId });
    return row.lastReadMessageId;
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
