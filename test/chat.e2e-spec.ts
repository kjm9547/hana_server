import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// 각자의 첫 메시지는 40자 이상의 편지여야 한다 (#12)
const MINSU_LETTER = 'はじめまして！ 韓国のミンスです。日本語を勉強していて、ゆっくり文化の話をしてみたいです。';
const YUKI_LETTER = 'こちらこそはじめまして！ 韓国語を勉強中のゆきです。おすすめの場所をたくさん教えてください！';

// JWT_SECRET, DATABASE_URL(인메모리 PGlite)은 vitest.config.e2e.ts의 env에서 온다. 앱마다 빈 DB로 시작.
describe('1:1 채팅: 대화방 → 메시지 → 실시간 수신', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const register = async (email: string, nativeLang: 'ko' | 'ja') => {
    const res = await http()
      .post('/auth/register')
      .send({ email, password: 'password123', nickname: email.split('@')[0], nativeLang })
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

  /** 이벤트 하나를 기다린다. 안 오면 실패. */
  const next = <T>(socket: Socket, event: string, ms = 2000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`'${event}' 이벤트가 ${ms}ms 안에 오지 않음`)), ms);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it('works end to end', async () => {
    const minsu = await register('minsu@example.com', 'ko');
    const yuki = await register('yuki@example.com', 'ja');
    const jiwoo = await register('jiwoo@example.com', 'ko'); // 대화에 끼지 않은 제3자

    // 미인증
    await http().post('/conversations').send({ partnerId: yuki.id }).expect(401);
    await http().get('/conversations').expect(401);

    // 대화방 생성: 검증 실패, 자기 자신, 없는 유저
    await http().post('/conversations').set(minsu.auth).send({}).expect(400);
    await http().post('/conversations').set(minsu.auth).send({ partnerId: minsu.id }).expect(400);
    await http().post('/conversations').set(minsu.auth).send({ partnerId: 99999 }).expect(404);

    const created = await http().post('/conversations').set(minsu.auth).send({ partnerId: yuki.id }).expect(201);
    expect(created.body.partner).toEqual({ id: yuki.id, nickname: 'yuki', nativeLang: 'ja', bio: '' });
    const conversationId = created.body.id as number;

    // 한 쌍당 대화방은 하나: 다시 만들거나 상대가 만들어도 같은 방
    const again = await http().post('/conversations').set(minsu.auth).send({ partnerId: yuki.id }).expect(201);
    const reverse = await http().post('/conversations').set(yuki.auth).send({ partnerId: minsu.id }).expect(201);
    expect(again.body.id).toBe(conversationId);
    expect(reverse.body.id).toBe(conversationId);
    expect(reverse.body.partner.id).toBe(minsu.id);

    // 같은 언어끼리도 대화 가능 (국적 자유)
    await http().post('/conversations').set(minsu.auth).send({ partnerId: jiwoo.id }).expect(201);

    // 실시간: 토큰 없는 소켓은 서버가 끊는다
    const anonymous = connect();
    await next(anonymous, 'disconnect');

    const yukiSocket = connect(yuki.token);
    const minsuSocket = connect(minsu.token);
    const jiwooSocket = connect(jiwoo.token);
    await Promise.all([yukiSocket, minsuSocket, jiwooSocket].map((s) => next(s, 'connect')));

    // 메시지 전송 → 두 참여자 모두 실시간 수신, 제3자는 못 받음
    let jiwooGotMessage = false;
    jiwooSocket.on('message:new', () => (jiwooGotMessage = true));
    const yukiReceived = next<{ conversationId: number; message: { body: string; senderId: number } }>(
      yukiSocket,
      'message:new',
    );
    const minsuReceived = next(minsuSocket, 'message:new');
    const sent = await http()
      .post(`/conversations/${conversationId}/messages`)
      .set(minsu.auth)
      .send({ body: `  ${MINSU_LETTER}  ` })
      .expect(201);
    expect(sent.body).toMatchObject({ conversationId, senderId: minsu.id, body: MINSU_LETTER });
    const pushed = await yukiReceived;
    expect(pushed).toMatchObject({ conversationId, message: { id: sent.body.id, body: MINSU_LETTER } });
    await minsuReceived;

    // 메시지 검증: 빈 문자열(공백만), 1000자 초과
    await http().post(`/conversations/${conversationId}/messages`).set(minsu.auth).send({ body: '   ' }).expect(400);
    await http()
      .post(`/conversations/${conversationId}/messages`)
      .set(minsu.auth)
      .send({ body: 'あ'.repeat(1001) })
      .expect(400);

    // 권한: 제3자는 남의 대화방을 읽지도 쓰지도 못한다 (존재 여부도 숨김 → 404)
    await http().get(`/conversations/${conversationId}/messages`).set(jiwoo.auth).expect(404);
    await http().post(`/conversations/${conversationId}/messages`).set(jiwoo.auth).send({ body: 'hi' }).expect(404);
    await http().get('/conversations/99999/messages').set(minsu.auth).expect(404);
    expect(jiwooGotMessage).toBe(false);

    // 페이징: 최신순, before 커서
    for (const body of [YUKI_LETTER, '3', '4']) {
      await http().post(`/conversations/${conversationId}/messages`).set(yuki.auth).send({ body }).expect(201);
    }
    const page1 = await http().get(`/conversations/${conversationId}/messages?limit=2`).set(minsu.auth).expect(200);
    expect(page1.body.items.map((m: { body: string }) => m.body)).toEqual(['4', '3']);
    const page2 = await http()
      .get(`/conversations/${conversationId}/messages?limit=2&before=${page1.body.nextCursor}`)
      .set(minsu.auth)
      .expect(200);
    expect(page2.body.items.map((m: { body: string }) => m.body)).toEqual([YUKI_LETTER, MINSU_LETTER]);
    expect(page2.body.nextCursor).toBeNull();

    // 목록: 최근 활동순, 상대 공개 프로필(이메일 없음) + 마지막 메시지
    const list = await http().get('/conversations').set(minsu.auth).expect(200);
    expect(list.body.items.map((c: { partner: { nickname: string } }) => c.partner.nickname)).toEqual([
      'yuki',
      'jiwoo',
    ]);
    expect(list.body.items[0].lastMessage).toMatchObject({ body: '4', senderId: yuki.id });
    expect(list.body.items[0].partner.email).toBeUndefined();
    expect(list.body.items[1].lastMessage).toBeNull();

    const yukiList = await http().get('/conversations').set(yuki.auth).expect(200);
    expect(yukiList.body.items).toHaveLength(1);
    expect(yukiList.body.items[0].partner.id).toBe(minsu.id);
  });
});
