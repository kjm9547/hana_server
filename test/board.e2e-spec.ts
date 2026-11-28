import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// JWT_SECRET, DATABASE_URL(인메모리 PGlite)은 vitest.config.e2e.ts의 env에서 온다. 앱마다 빈 DB로 시작.
describe('게시판: 글 → 목록 → 댓글 → 좋아요 → 삭제', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  const register = async (email: string, nativeLang: 'ko' | 'ja') => {
    const res = await http()
      .post('/auth/register')
      .send({ email, password: 'password123', nickname: email.split('@')[0], nativeLang })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const me = await http().get('/me').set(auth).expect(200);
    return { id: me.body.id as number, auth };
  };

  it('works end to end', async () => {
    const minsu = await register('minsu@example.com', 'ko');
    const yuki = await register('yuki@example.com', 'ja');

    // 미인증
    await http().get('/posts').expect(401);
    await http().post('/posts').send({ title: 't', body: 'b' }).expect(401);

    // 검증 실패: 너무 긴 제목, 빈 제목, 빈 본문
    const post = (auth: Record<string, string>, body: object) => http().post('/posts').set(auth).send(body);
    await post(minsu.auth, { title: 'あ'.repeat(101), body: '본문' }).expect(400);
    await post(minsu.auth, { title: '   ', body: '본문' }).expect(400);
    await post(minsu.auth, { title: '제목', body: '' }).expect(400);

    // 작성: 상세 형태로 돌려준다
    const first = await post(yuki.auth, {
      title: '釜山の海雲台、冬もきれいでした',
      body: 'テジクッパも最高！',
    }).expect(201);
    expect(first.body).toMatchObject({
      title: '釜山の海雲台、冬もきれいでした',
      author: { id: yuki.id, nickname: 'yuki', nativeLang: 'ja' },
      commentCount: 0,
      likeCount: 0,
      likedByMe: false,
      comments: [],
    });
    expect(first.body.author.email).toBeUndefined();
    const second = await post(minsu.auth, {
      title: '「大丈夫です」 거절할 때도?',
      body: '궁금해요',
    });
    const third = await post(minsu.auth, { title: '교토 같이 가요', body: '12월 첫 주' });

    // 목록: 최신순 + 커서 페이징
    const page1 = await http().get('/posts?limit=2').set(minsu.auth).expect(200);
    expect(page1.body.items.map((p: { id: number }) => p.id)).toEqual([third.body.id, second.body.id]);
    expect(page1.body.nextCursor).toBe(second.body.id);
    const page2 = await http().get(`/posts?limit=2&before=${page1.body.nextCursor}`).set(minsu.auth).expect(200);
    expect(page2.body.items.map((p: { id: number }) => p.id)).toEqual([first.body.id]);
    expect(page2.body.nextCursor).toBeNull();

    // 상세: 없는 글 404, 잘못된 id 400
    await http().get('/posts/99999').set(minsu.auth).expect(404);
    await http().get('/posts/abc').set(minsu.auth).expect(400);

    // 댓글
    const postId = first.body.id as number;
    await http().post(`/posts/${postId}/comments`).set(minsu.auth).send({ body: '  ' }).expect(400);
    await http().post('/posts/99999/comments').set(minsu.auth).send({ body: '안녕' }).expect(404);
    const comment = await http()
      .post(`/posts/${postId}/comments`)
      .set(minsu.auth)
      .send({ body: '겨울 바다 너무 예뻐요!' })
      .expect(201);
    expect(comment.body).toMatchObject({ body: '겨울 바다 너무 예뻐요!', author: { id: minsu.id } });
    await http().post(`/posts/${postId}/comments`).set(yuki.auth).send({ body: 'ありがとう！' }).expect(201);

    // 좋아요: 두 번 눌러도 하나, 취소도 두 번 해도 0
    await http().put('/posts/99999/like').set(minsu.auth).expect(404);
    await http().put(`/posts/${postId}/like`).set(minsu.auth).expect(200, { liked: true, likeCount: 1 });
    await http().put(`/posts/${postId}/like`).set(minsu.auth).expect(200, { liked: true, likeCount: 1 });
    await http().put(`/posts/${postId}/like`).set(yuki.auth).expect(200, { liked: true, likeCount: 2 });
    await http().delete(`/posts/${postId}/like`).set(yuki.auth).expect(200, { liked: false, likeCount: 1 });
    await http().delete(`/posts/${postId}/like`).set(yuki.auth).expect(200, { liked: false, likeCount: 1 });

    // 상세에 댓글(오래된 순)·개수·내 좋아요가 반영된다
    const detail = await http().get(`/posts/${postId}`).set(minsu.auth).expect(200);
    expect(detail.body).toMatchObject({ commentCount: 2, likeCount: 1, likedByMe: true });
    expect(detail.body.comments.map((c: { body: string }) => c.body)).toEqual([
      '겨울 바다 너무 예뻐요!',
      'ありがとう！',
    ]);
    const asYuki = await http().get(`/posts/${postId}`).set(yuki.auth).expect(200);
    expect(asYuki.body.likedByMe).toBe(false);

    // 삭제: 남의 글은 403, 작성자는 204, 지운 뒤 404 (댓글·좋아요도 같이 지워진다)
    await http().delete(`/posts/${postId}`).set(minsu.auth).expect(403);
    await http().delete('/posts/99999').set(yuki.auth).expect(404);
    await http().delete(`/posts/${postId}`).set(yuki.auth).expect(204);
    await http().get(`/posts/${postId}`).set(yuki.auth).expect(404);
    const after = await http().get('/posts').set(yuki.auth).expect(200);
    expect(after.body.items.map((p: { id: number }) => p.id)).toEqual([third.body.id, second.body.id]);
  });
  it('사진: 올리기 → 글에 붙이기 → 보기 → 글과 함께 지우기', async () => {
    const minsu = await register('minsu2@example.com', 'ko');
    const yuki = await register('yuki2@example.com', 'ja');
    // 형식은 파일 앞부분으로만 판별하므로 시그니처 + 아무 바이트면 된다
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.from('fake-png-body')]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpg-body')]);
    const upload = (auth: Record<string, string>, data: Buffer, name: string) =>
      http().post('/images').set(auth).attach('file', data, name);

    // 미인증 · 파일 없음 · 이미지가 아닌 파일 (확장자만 jpg)
    await http().post('/images').attach('file', png, 'a.png').expect(401);
    await http().post('/images').set(minsu.auth).expect(400);
    await upload(minsu.auth, Buffer.from('not an image'), 'fake.jpg').expect(400);

    const a = await upload(minsu.auth, png, 'a.png').expect(201);
    const b = await upload(minsu.auth, jpg, 'b.jpg').expect(201);
    expect(a.body.url).toMatch(/^\/images\/[0-9a-f-]{36}\.png$/);
    expect(b.body.url).toMatch(/\.jpg$/);

    // 사진 보기는 로그인 없이, 올린 바이트 그대로
    const got = await http().get(a.body.url).buffer(true).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(got.body as Buffer, png)).toBe(0);
    await http().get('/images/..%2F.env').expect(400);
    await http().get('/images/00000000-0000-0000-0000-000000000000.png').expect(404);

    // 남의 사진 · 중복 · 10장 초과는 400, 글도 만들어지지 않는다
    const write = (auth: Record<string, string>, imageIds: number[]) =>
      http().post('/posts').set(auth).send({ title: '해운대', body: '겨울 바다', imageIds });
    await write(yuki.auth, [a.body.id]).expect(400);
    await write(minsu.auth, [a.body.id, a.body.id]).expect(400);
    await write(
      minsu.auth,
      Array.from({ length: 11 }, (_, i) => i + 1),
    ).expect(400);

    // 보낸 순서대로 붙는다
    const created = await write(minsu.auth, [b.body.id, a.body.id]).expect(201);
    expect(created.body.images).toEqual([b.body.url, a.body.url]);
    // 이미 붙은 사진은 다른 글에 못 쓴다
    await write(minsu.auth, [a.body.id]).expect(400);
    const list = await http().get('/posts').set(minsu.auth).expect(200);
    expect(list.body.items.find((p: { id: number }) => p.id === created.body.id).images).toEqual([
      b.body.url,
      a.body.url,
    ]);
    expect(list.body.items.filter((p: { title: string }) => p.title === '해운대')).toHaveLength(1);

    // 글을 지우면 사진 파일도 지워진다
    await http().delete(`/posts/${created.body.id}`).set(minsu.auth).expect(204);
    await http().get(a.body.url).expect(404);
  });
});
