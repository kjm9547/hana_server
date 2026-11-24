import { createTestApp, letter, nextEvent } from './helpers.js';

describe('첫 메시지 편지, 읽음·안 읽은 수', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const unreadOf = async (auth: Record<string, string>, conversationId: number) => {
    const res = await t.http().get('/conversations').set(auth).expect(200);
    return res.body.items.find((c: { id: number }) => c.id === conversationId).unreadCount as number;
  };

  it('works end to end', async () => {
    const a = await t.register('aoi', 'ja');
    const b = await t.register('bomi', 'ko');
    const outsider = await t.register('outsider', 'ko');
    const conv = await t.http().post('/conversations').set(a.auth).send({ partnerId: b.id }).expect(201);
    const id = conv.body.id as number;
    const send = (auth: Record<string, string>, body: string) =>
      t.http().post(`/conversations/${id}/messages`).set(auth).send({ body });

    // 방 정보: 처음엔 둘 다 편지를 써야 하고 읽은 위치 없음. 남의 방은 404
    const room0 = await t.http().get(`/conversations/${id}`).set(a.auth).expect(200);
    expect(room0.body).toMatchObject({
      id,
      partner: { id: b.id, nickname: 'bomi' },
      needsLetter: true,
      myLastReadMessageId: null,
      partnerLastReadMessageId: null,
    });
    await t.http().get(`/conversations/${id}`).set(outsider.auth).expect(404);

    // 첫 메시지: 39자 400, 40자 201
    await send(a.auth, 'あ'.repeat(39)).expect(400);
    const first = await send(a.auth, 'あ'.repeat(40)).expect(201);
    // 두 번째부터는 짧아도 된다
    const second = await send(a.auth, 'ok').expect(201);
    expect((await t.http().get(`/conversations/${id}`).set(a.auth).expect(200)).body.needsLetter).toBe(false);

    // 상대는 아직 첫 메시지 전이라 짧으면 400. 글자 수는 코드포인트 기준 (이모지 40개 = 40자)
    await send(b.auth, 'hi').expect(400);
    await send(b.auth, '😀'.repeat(40)).expect(201);

    // 안 읽은 수: 상대가 보낸 것만 센다
    expect(await unreadOf(b.auth, id)).toBe(2);
    expect(await unreadOf(a.auth, id)).toBe(1);

    // 읽음 → 상대에게 실시간 이벤트, 안 읽은 수 감소
    const aSocket = t.connect(a.token);
    await nextEvent(aSocket, 'connect');
    const readEvent = nextEvent(aSocket, 'conversation:read');
    const read = await t
      .http()
      .post(`/conversations/${id}/read`)
      .set(b.auth)
      .send({ messageId: first.body.id })
      .expect(200);
    expect(read.body.lastReadMessageId).toBe(first.body.id);
    expect(await readEvent).toEqual({ conversationId: id, userId: b.id, lastReadMessageId: first.body.id });
    expect(await unreadOf(b.auth, id)).toBe(1);

    await t.http().post(`/conversations/${id}/read`).set(b.auth).send({ messageId: second.body.id }).expect(200);
    expect(await unreadOf(b.auth, id)).toBe(0);
    // 예전 메시지를 다시 읽어도 읽은 위치는 뒤로 가지 않는다
    const back = await t.http().post(`/conversations/${id}/read`).set(b.auth).send({ messageId: first.body.id });
    expect(back.body.lastReadMessageId).toBe(second.body.id);
    const roomA = await t.http().get(`/conversations/${id}`).set(a.auth).expect(200);
    expect(roomA.body.partnerLastReadMessageId).toBe(second.body.id);

    // 검증·권한: 다른 방의 메시지 404, 제3자 404, 잘못된 값 400
    const otherConv = await t.http().post('/conversations').set(outsider.auth).send({ partnerId: b.id }).expect(201);
    const otherMsg = await t
      .http()
      .post(`/conversations/${otherConv.body.id}/messages`)
      .set(outsider.auth)
      .send({ body: letter() })
      .expect(201);
    await t.http().post(`/conversations/${id}/read`).set(b.auth).send({ messageId: otherMsg.body.id }).expect(404);
    await t.http().post(`/conversations/${id}/read`).set(outsider.auth).send({ messageId: first.body.id }).expect(404);
    await t.http().post(`/conversations/${id}/read`).set(b.auth).send({ messageId: 'x' }).expect(400);
  });
});
