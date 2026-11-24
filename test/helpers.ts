import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * e2e 공통 준비. JWT_SECRET, DATABASE_URL(인메모리 PGlite)은 vitest.config.e2e.ts의 env에서 온다.
 * 앱마다 빈 DB로 시작한다.
 */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PasswordHasher)
    .useValue(new PasswordHasher({ logN: 10 }))
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.listen(0);
  const url = await app.getUrl();
  const sockets: Socket[] = [];

  const http = () => request(app.getHttpServer());

  /** 가입 후 { id, token, auth(헤더) } */
  const register = async (nickname: string, nativeLang: 'ko' | 'ja') => {
    const res = await http()
      .post('/auth/register')
      .send({ email: `${nickname}@example.com`, password: 'password123', nickname, nativeLang })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const me = await http().get('/me').set(auth).expect(200);
    return { id: me.body.id as number, token: res.body.accessToken as string, auth };
  };

  const connect = (token?: string) => {
    const socket = io(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  };

  const close = async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  };

  return { app, http, register, connect, close };
}

export type TestUser = Awaited<ReturnType<Awaited<ReturnType<typeof createTestApp>>['register']>>;

/** 이벤트 하나를 기다린다. 안 오면 실패. */
export const nextEvent = <T>(socket: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`'${event}' 이벤트가 ${ms}ms 안에 오지 않음`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** 40자 이상 (첫 메시지 편지 규칙을 통과하는 본문) */
export const letter = (tag = '') =>
  `${tag}처음 인사드려요. 천천히 서로의 언어와 이야기를 나눠보고 싶어서 정성껏 편지를 씁니다.`;
