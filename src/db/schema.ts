import { integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
