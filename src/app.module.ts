import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { AuthController, JwtAuth } from './auth/auth.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatGateway } from './chat/chat.gateway.js';
import { ChatRepository } from './chat/chat.repository.js';
import { Clock } from './common/clock.js';
import { createDatabase } from './db/database.js';
import { IntroductionsController } from './introductions/introductions.controller.js';
import { IntroductionsRepository } from './introductions/introductions.repository.js';
import { PhrasesController } from './phrases/phrases.js';
import { SafetyController } from './safety/safety.controller.js';
import { SafetyRepository } from './safety/safety.repository.js';
import { UsersController } from './users/users.controller.js';
import { UsersRepository } from './users/users.repository.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: async () => ({ db: await createDatabase(process.env.DATABASE_URL) }),
    }),
    AuthenticationModule.forRoot({
      // ponytail: 30일짜리 access token만 발급(리프레시 없음). 토큰 강제 만료가 필요해지면 refreshToken + DB 저장소로 전환.
      accessToken: { key: process.env.JWT_SECRET!, ttl: '30d' },
      refreshToken: false,
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    PhrasesController,
    ChatController,
    SafetyController,
    IntroductionsController,
  ],
  providers: [
    UsersRepository,
    ChatRepository,
    ChatGateway,
    SafetyRepository,
    IntroductionsRepository,
    Clock,
    JwtAuth,
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
  ],
})
export class AppModule {}
