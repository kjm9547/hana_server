import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { AuthController, JwtAuth } from './auth/auth.js';
import { PhrasesController } from './phrases/phrases.js';
import { UsersController } from './users/users.controller.js';
import { UsersRepository } from './users/users.repository.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: async () => {
        const file = process.env.DATABASE_FILE ?? 'data/hana.db';
        mkdirSync(dirname(file), { recursive: true });
        const db = drizzle({ connection: { url: `file:${file}` } });
        await db.run(sql`PRAGMA foreign_keys = ON`);
        await migrate(db, { migrationsFolder: './drizzle' });
        return { db };
      },
    }),
    AuthenticationModule.forRoot({
      // ponytail: 30일짜리 access token만 발급(리프레시 없음). 토큰 강제 만료가 필요해지면 refreshToken + DB 저장소로 전환.
      accessToken: { key: process.env.JWT_SECRET!, ttl: '30d' },
      refreshToken: false,
    }),
  ],
  controllers: [AuthController, UsersController, PhrasesController],
  providers: [UsersRepository, JwtAuth, { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() }],
})
export class AppModule {}
