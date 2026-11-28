import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

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

// 게시판 글. ponytail: 사진·번역은 v1 제외라 글자만.
export const posts = pgTable(
  'posts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('posts_author_id_idx').on(t.authorId)],
);

export const postComments = pgTable(
  'post_comments',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_comments_post_id_idx').on(t.postId, t.id)],
);

// 한 사람이 한 글에 좋아요 한 번. 복합 PK라 여러 번 눌러도 한 줄만 남는다.
export const postLikes = pgTable(
  'post_likes',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

// 게시판 사진. 먼저 올려 두고(post_id 없음) 글을 쓸 때 그 글에 붙인다. 파일은 서버 폴더(UPLOAD_DIR)에.
export const postImages = pgTable(
  'post_images',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    uploaderId: integer('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    // 글 안에서의 순서 (붙일 때 정한다)
    position: integer(),
    filename: text().notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_images_post_id_idx').on(t.postId, t.position)],
);
