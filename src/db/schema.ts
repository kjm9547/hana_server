import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const LANGS = ['ko', 'ja'] as const;

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text().notNull(),
  nativeLang: text('native_lang', { enum: LANGS }).notNull(),
  bio: text().notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
