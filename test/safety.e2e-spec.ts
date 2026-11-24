import { createTestApp } from './helpers.js';

describe('차단·신고·매칭 옵션', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('매칭 옵션: 기본 any, cross로 변경, 잘못된 값 400', async () => {
    const minsu = await t.register('minsu', 'ko');
    const me = await t.http().get('/me').set(minsu.auth).expect(200);
    expect(me.body.matchPreference).toBe('any');

    const updated = await t.http().patch('/me').set(minsu.auth).send({ matchPreference: 'cross' }).expect(200);
    expect(updated.body.matchPreference).toBe('cross');
    await t.http().patch('/me').set(minsu.auth).send({ matchPreference: 'everyone' }).expect(400);
  });

  it('차단: 목록·대화에서 양방향으로 막히고, 해제하면 풀린다', async () => {
    const jun = await t.register('jun', 'ko');
    const hana = await t.register('hana', 'ja');
    const mio = await t.register('mio', 'ja');

    await t.http().post(`/users/${hana.id}/block`).expect(401);
    await t.http().post(`/users/${jun.id}/block`).set(jun.auth).expect(400); // 자기 자신
    await t.http().post('/users/99999/block').set(jun.auth).expect(404);

    const conv = await t.http().post('/conversations').set(jun.auth).send({ partnerId: hana.id }).expect(201);
    const path = `/conversations/${conv.body.id}/messages`;

    // hana가 jun을 차단 (두 번 해도 같은 결과)
    await t.http().post(`/users/${jun.id}/block`).set(hana.auth).expect(204);
    await t.http().post(`/users/${jun.id}/block`).set(hana.auth).expect(204);
    const blocked = await t.http().get('/blocks').set(hana.auth).expect(200);
    expect(blocked.body.items.map((u: { id: number }) => u.id)).toEqual([jun.id]);
    expect(blocked.body.items[0].email).toBeUndefined();

    // 양방향: 차단당한 쪽(jun)도, 차단한 쪽(hana)도 보낼 수 없고 새 대화도 시작 못 한다
    await t.http().post(path).set(jun.auth).send({ body: 'hi' }).expect(403);
    await t.http().post(path).set(hana.auth).send({ body: 'hi' }).expect(403);
    await t.http().post('/conversations').set(jun.auth).send({ partnerId: hana.id }).expect(403);

    // 상대 목록(/users)에서 양쪽 모두 빠진다
    const junPartners = await t.http().get('/users').set(jun.auth).expect(200);
    expect(junPartners.body.items.map((u: { id: number }) => u.id)).toEqual([mio.id]);
    const hanaPartners = await t.http().get('/users').set(hana.auth).expect(200);
    expect(hanaPartners.body.items.map((u: { id: number }) => u.id)).not.toContain(jun.id);

    // 대화 목록: 차단한 쪽에서만 숨김
    const hanaList = await t.http().get('/conversations').set(hana.auth).expect(200);
    expect(hanaList.body.items).toHaveLength(0);
    const junList = await t.http().get('/conversations').set(jun.auth).expect(200);
    expect(junList.body.items).toHaveLength(1);

    // 해제하면 다시 보낼 수 있다
    await t.http().delete(`/users/${jun.id}/block`).set(hana.auth).expect(204);
    await t.http().post(path).set(jun.auth).send({ body: 'hi' }).expect(201);
  });

  it('신고: 사유 검증, 대화방 근거 확인, 신고하면 자동 차단', async () => {
    const ryo = await t.register('ryo', 'ja');
    const seo = await t.register('seo', 'ko');
    const other = await t.register('other', 'ko');

    const conv = await t.http().post('/conversations').set(seo.auth).send({ partnerId: ryo.id }).expect(201);
    const otherConv = await t.http().post('/conversations').set(other.auth).send({ partnerId: ryo.id }).expect(201);

    await t.http().post('/reports').set(seo.auth).send({ userId: ryo.id, reason: 'rude' }).expect(400);
    await t.http().post('/reports').set(seo.auth).send({ userId: seo.id, reason: 'spam' }).expect(400);
    // 남의 대화방을 근거로 붙일 수 없다
    await t
      .http()
      .post('/reports')
      .set(seo.auth)
      .send({ userId: ryo.id, reason: 'spam', conversationId: otherConv.body.id })
      .expect(404);

    const report = await t
      .http()
      .post('/reports')
      .set(seo.auth)
      .send({ userId: ryo.id, reason: 'harassment', detail: '불쾌한 메시지', conversationId: conv.body.id })
      .expect(201);
    expect(typeof report.body.id).toBe('number');

    const blocked = await t.http().get('/blocks').set(seo.auth).expect(200);
    expect(blocked.body.items.map((u: { id: number }) => u.id)).toEqual([ryo.id]);
    await t.http().post(`/conversations/${conv.body.id}/messages`).set(ryo.auth).send({ body: 'hi' }).expect(403);
  });
});
