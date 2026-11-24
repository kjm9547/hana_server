import { createTestApp, FakeClock } from './helpers.js';

type Intro = { id: number; status: string; conversationId: number | null; candidate: { id: number; nickname: string } };

describe('오늘의 인연', () => {
  const clock = new FakeClock();
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  const today = async (auth: Record<string, string>) => {
    const res = await t.http().get('/introductions/today').set(auth).expect(200);
    return res.body.items as Intro[];
  };
  const names = (items: Intro[]) => items.map((i) => i.candidate.nickname).sort();

  it('하루 3명, 같은 날엔 같은 결과, 넘기면·날이 바뀌면 다시 안 나온다', async () => {
    clock.date = '2026-03-01';
    const me = await t.register('me', 'ko');
    // 소개 가능한 5명
    for (const [n, l] of [
      ['k1', 'ko'],
      ['k2', 'ko'],
      ['j1', 'ja'],
      ['j2', 'ja'],
      ['j3', 'ja'],
    ] as const) {
      await t.register(n, l);
    }
    // 소개되면 안 되는 사람들
    const blocked = await t.register('blocked', 'ja');
    await t.http().post(`/users/${blocked.id}/block`).set(me.auth).expect(204);
    const blocker = await t.register('blocker', 'ja');
    await t.http().post(`/users/${me.id}/block`).set(blocker.auth).expect(204);
    const crossKo = await t.register('crossko', 'ko'); // 한·일만 원하는 한국인 → 한국인인 나에겐 안 나옴
    await t.http().patch('/me').set(crossKo.auth).send({ matchPreference: 'cross' }).expect(200);
    const talking = await t.register('talking', 'ja'); // 이미 대화 중
    await t.http().post('/conversations').set(me.auth).send({ partnerId: talking.id }).expect(201);

    await t.http().get('/introductions/today').expect(401);

    const eligible = ['j1', 'j2', 'j3', 'k1', 'k2'];
    const day1 = await today(me.auth);
    expect(day1).toHaveLength(3);
    expect(day1.every((i) => eligible.includes(i.candidate.nickname) && i.status === 'pending')).toBe(true);
    expect((day1[0].candidate as Record<string, unknown>).email).toBeUndefined();
    expect(names(await today(me.auth))).toEqual(names(day1)); // 같은 날엔 같은 결과

    const [toPass, toAccept] = day1;
    // 남의 소개는 건드릴 수 없다
    await t.http().post(`/introductions/${toPass.id}/pass`).set(blocker.auth).expect(404);

    await t.http().post(`/introductions/${toPass.id}/pass`).set(me.auth).expect(201);
    await t.http().post(`/introductions/${toPass.id}/pass`).set(me.auth).expect(409);
    await t.http().post(`/introductions/${toPass.id}/accept`).set(me.auth).expect(409);

    const accepted = await t.http().post(`/introductions/${toAccept.id}/accept`).set(me.auth).expect(201);
    expect(accepted.body.conversation.partner.id).toBe(toAccept.candidate.id);
    const again = await t.http().post(`/introductions/${toAccept.id}/accept`).set(me.auth).expect(201);
    expect(again.body.conversation.id).toBe(accepted.body.conversation.id);
    const statuses = Object.fromEntries((await today(me.auth)).map((i) => [i.id, i.status]));
    expect(statuses[toPass.id]).toBe('passed');
    expect(statuses[toAccept.id]).toBe('accepted');

    // 다음 날: 어제 소개된 3명(처리 안 한 1명 포함)은 다시 안 나오고 남은 2명만
    clock.date = '2026-03-02';
    const day2 = await today(me.auth);
    expect(names(day2)).toEqual(eligible.filter((n) => !names(day1).includes(n)).sort());
    // 어제 소개는 사라졌다
    await t.http().post(`/introductions/${day1[2].id}/accept`).set(me.auth).expect(404);

    // 그다음 날: 더 소개할 사람이 없다
    clock.date = '2026-03-03';
    expect(await today(me.auth)).toEqual([]);
  });

  it('한·일만(cross)을 고르면 다른 언어 사용자만 소개된다', async () => {
    clock.date = '2026-04-01';
    const picky = await t.register('picky', 'ja');
    await t.http().patch('/me').set(picky.auth).send({ matchPreference: 'cross' }).expect(200);
    const items = await today(picky.auth);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      const res = await t.http().get('/users?limit=50').set(picky.auth).expect(200);
      expect(res.body.items.map((u: { id: number }) => u.id)).toContain(i.candidate.id); // /users = 다른 언어 사용자
    }
  });
});
