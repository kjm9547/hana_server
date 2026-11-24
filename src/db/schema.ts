import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const LANGS = ['ko', 'ja'] as const;
export const lang = pgEnum('lang', LANGS);

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text().notNull(),
  nativeLang: lang('native_lang').notNull(),
  bio: text().notNull().default(''),
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
