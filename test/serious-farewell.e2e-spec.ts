import { createTestApp, letter, nextEvent, type TestUser } from './helpers.js';

describe('진지한 인연 신청, 끝맺음 인사', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const startTalking = async (x: TestUser, y: TestUser, { bothSent = true } = {}) => {
    const conv = await t.http().post('/conversations').set(x.auth).send({ partnerId: y.id }).expect(201);
    const id = conv.body.id as number;
    await t
      .http()
      .post(`/conversations/${id}/messages`)
      .set(x.auth)
      .send({ body: letter('x') })
      .expect(201);
    if (bothSent)
      await t
        .http()
        .post(`/conversations/${id}/messages`)
        .set(y.auth)
        .send({ body: letter('y') })
        .expect(201);
    return id;
  };
  const room = async (auth: Record<string, string>, id: number) =>
    (await t.http().get(`/conversations/${id}`).set(auth).expect(200)).body;

  it('신청 → 거절 → (상대가) 재신청 → 수락', async () => {
    const a = await t.register('akari', 'ja');
    const b = await t.register('beom', 'ko');
    const outsider = await t.register('nosy', 'ko');
    const id = await startTalking(a, b, { bothSent: false });
    const serious = (u: TestUser) => t.http().post(`/conversations/${id}/serious`).set(u.auth);
    const respond = (u: TestUser, accept: boolean) =>
      t.http().post(`/conversations/${id}/serious/respond`).set(u.auth).send({ accept });

    // 상대가 아직 메시지를 안 보냈으면 신청 불가
    await serious(a).expect(400);
    await t
      .http()
      .post(`/conversations/${id}/messages`)
      .set(b.auth)
      .send({ body: letter('b') })
      .expect(201);
    await serious(outsider).expect(404);

    const bSocket = t.connect(b.token);
    await nextEvent(bSocket, 'connect');
    const requested = nextEvent(bSocket, 'serious:requested');
    const req = await serious(a).expect(201);
    expect(req.body.status).toBe('pending');
    expect(await requested).toEqual({ conversationId: id });

    await serious(a).expect(409); // 대기 중 중복
    await serious(b).expect(409); // 대기 중이면 상대도 못 보냄
    expect((await room(b.auth, id)).seriousRequest).toMatchObject({ requestedByMe: false });
    expect((await room(a.auth, id)).seriousRequest).toMatchObject({ requestedByMe: true });

    await respond(a, true).expect(404); // 내가 보낸 신청엔 응답 불가
    await respond(b, 'yes' as unknown as boolean).expect(400);
    expect((await respond(b, false).expect(200)).body).toEqual({ status: 'declined', seriousAt: null });
    expect(await room(a.auth, id)).toMatchObject({ seriousRequest: null, seriousAt: null });

    await serious(a).expect(409); // 거절당한 신청자는 재신청 불가
    await serious(b).expect(201); // 상대는 가능
    const accepted = await respond(a, true).expect(200);
    expect(accepted.body.status).toBe('accepted');
    expect((await room(b.auth, id)).seriousAt).toBe(accepted.body.seriousAt);
    const list = await t.http().get('/conversations').set(a.auth).expect(200);
    expect(list.body.items.find((c: { id: number }) => c.id === id).seriousAt).toBe(accepted.body.seriousAt);
    await serious(b).expect(409); // 이미 진지한 인연
  });

  it('동시에 신청해도 대기 중 신청은 하나만', async () => {
    const c = await t.register('chiaki', 'ja');
    const d = await t.register('dami', 'ko');
    const id = await startTalking(c, d);
    const results = await Promise.all([
      t.http().post(`/conversations/${id}/serious`).set(c.auth),
      t.http().post(`/conversations/${id}/serious`).set(d.auth),
    ]);
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 409]);
  });

  it('끝맺음 인사: 마지막 인사를 남기고 닫히면 아무도 보낼 수 없다', async () => {
    const e = await t.register('emi', 'ja');
    const f = await t.register('fiona', 'ko');
    const outsider = await t.register('peek', 'ja');
    const id = await startTalking(e, f);
    const close = (u: TestUser, farewell: string) =>
      t.http().post(`/conversations/${id}/close`).set(u.auth).send({ farewell });

    await close(e, '   ').expect(400);
    await close(e, 'あ'.repeat(501)).expect(400);
    await close(outsider, '안녕').expect(404);

    const fSocket = t.connect(f.token);
    await nextEvent(fSocket, 'connect');
    const pushed = nextEvent<{ message: { kind: string; body: string } }>(fSocket, 'message:new');
    const farewell = await close(e, '즐거웠어요. 좋은 여행 되세요!').expect(201);
    expect(farewell.body).toMatchObject({ kind: 'farewell', senderId: e.id, body: '즐거웠어요. 좋은 여행 되세요!' });
    expect((await pushed).message).toMatchObject({ kind: 'farewell' });

    // 닫힌 방: 전송·신청·다시 닫기 모두 409
    await t.http().post(`/conversations/${id}/messages`).set(f.auth).send({ body: 'wait' }).expect(409);
    await t.http().post(`/conversations/${id}/messages`).set(e.auth).send({ body: 'wait' }).expect(409);
    await t.http().post(`/conversations/${id}/serious`).set(f.auth).expect(409);
    await close(f, '저도요').expect(409);

    expect(await room(e.auth, id)).toMatchObject({ closedByMe: true });
    const roomF = await room(f.auth, id);
    expect(roomF).toMatchObject({ closedByMe: false });
    expect(roomF.closedAt).not.toBeNull();
    const messages = await t.http().get(`/conversations/${id}/messages?limit=1`).set(f.auth).expect(200);
    expect(messages.body.items[0]).toMatchObject({ kind: 'farewell' });
    const list = await t.http().get('/conversations').set(f.auth).expect(200);
    const item = list.body.items.find((c: { id: number }) => c.id === id);
    expect(item.closedAt).not.toBeNull();
    expect(item.lastMessage.kind).toBe('farewell');
  });
});
