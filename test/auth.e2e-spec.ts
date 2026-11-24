import { rmSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// JWT_SECRET, DATABASE_FILE은 vitest.config.e2e.ts의 env에서 온다.
describe('가입 → 로그인 → 프로필 → 상대 목록', () => {
  let app: INestApplication;

  beforeAll(async () => {
    rmSync(process.env.DATABASE_FILE!, { force: true });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const register = (email: string, nativeLang: 'ko' | 'ja') =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123', nickname: email.split('@')[0], nativeLang });

  it('works end to end', async () => {
    const http = request(app.getHttpServer());

    const ko = await register('Minsu@Example.com', 'ko').expect(201);
    await register('yuki@example.com', 'ja').expect(201);
    await register('jiwoo@example.com', 'ko').expect(201);
    await register('minsu@example.com', 'ko').expect(409); // 이메일은 소문자로 정규화되어 중복 판정
    await register('bad', 'ko').expect(400);

    await http.post('/auth/token').send({ email: 'minsu@example.com', password: 'wrong-pass' }).expect(401);
    const signIn = await http.post('/auth/token').send({ email: 'minsu@example.com', password: 'password123' }).expect(200);
    expect(typeof signIn.body.accessToken).toBe('string');
    const auth = { Authorization: `Bearer ${ko.body.accessToken}` };

    await http.get('/me').expect(401);
    const me = await http.get('/me').set(auth).expect(200);
    expect(me.body).toMatchObject({ email: 'minsu@example.com', nativeLang: 'ko' });
    expect(me.body.passwordHash).toBeUndefined();

    const updated = await http.patch('/me').set(auth).send({ bio: 'こんにちは！' }).expect(200);
    expect(updated.body.bio).toBe('こんにちは！');

    // 한국어 화자에게는 일본어 화자만 보인다
    const list = await http.get('/users').set(auth).expect(200);
    expect(list.body.items.map((u: { nickname: string }) => u.nickname)).toEqual(['yuki']);
    expect(list.body.items[0].email).toBeUndefined();
  });
});
