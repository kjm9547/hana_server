import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const LANGS = ['ko', 'ja'] as const;
export const lang = pgEnum('lang', LANGS);

// any: 국적 자유(기본) / cross: 한·일끼리만 소개받기. 상대의 옵션도 함께 존중한다.
export const MATCH_PREFERENCES = ['any', 'cross'] as const;
export const matchPreference = pgEnum('match_preference', MATCH_PREFERENCES);

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text().notNull(),
  nativeLang: lang('native_lang').notNull(),
  bio: text().notNull().default(''),
  matchPreference: matchPreference('match_preference').notNull().default('any'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 1:1 대화방. 한 쌍당 하나만 있도록 항상 작은 id를 user_a에 둔다.
export const conversations = pgTable(
  'conversations',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userAId: integer('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: integer('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 목록 정렬용. 메시지를 보낼 때 같은 트랜잭션에서 갱신한다
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('conversations_pair_unique').on(t.userAId, t.userBId),
    check('conversations_pair_order', sql`${t.userAId} < ${t.userBId}`),
    index('conversations_user_b_idx').on(t.userBId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_id_idx').on(t.conversationId, t.id)],
);

// 차단: 한쪽이 막아도 양쪽 모두 소개·대화가 막힌다
export const blocks = pgTable(
  'blocks',
  {
    blockerId: integer('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: integer('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('blocks_blocked_id_idx').on(t.blockedId)],
);

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'scam', 'other'] as const;
export const reportReason = pgEnum('report_reason', REPORT_REASONS);

// ponytail: 검토 화면 없음. 운영 시작 전에 관리자 확인 경로(최소한 알림)가 필요하다.
export const reports = pgTable('reports', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  reporterId: integer('reporter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reportedId: integer('reported_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reason: reportReason().notNull(),
  detail: text().notNull().default(''),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const INTRODUCTION_STATUSES = ['pending', 'passed', 'accepted'] as const;
export const introductionStatus = pgEnum('introduction_status', INTRODUCTION_STATUSES);

// 오늘의 인연. (user, candidate)는 한 번뿐 — 넘겼든 안 열어봤든 다시 소개하지 않는다 (一期一会)
export const introductions = pgTable(
  'introductions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    candidateId: integer('candidate_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date({ mode: 'string' }).notNull(),
    status: introductionStatus().notNull().default('pending'),
    conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('introductions_once').on(t.userId, t.candidateId),
    index('introductions_user_date_idx').on(t.userId, t.date),
  ],
);

// 대화방별로 각자 어디까지 읽었는지. 뒤로 가지 않는다 (greatest로 갱신)
export const conversationReads = pgTable(
  'conversation_reads',
  {
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: integer('last_read_message_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);
