import { PasswordHasher } from '@nestjs/authentication';
import { createDatabase } from './database.js';
import { users } from './schema.js';

// 개발용 계정. 민수·ゆき는 프론트 로그인 화면의 "테스트 로그인" 버튼이 쓴다.
// 나머지는 오늘의 인연(하루 3명, 한 번 소개되면 다시 안 나옴)을 며칠 확인해볼 수 있게 둔 후보들. 이미 있으면 건너뛴다.
const DEV_USERS = [
  {
    email: 'minsu@hana.dev',
    nickname: '민수',
    nativeLang: 'ko',
    bio: '일본 여행을 좋아해요. 오사카 사투리 배우는 중!',
  },
  {
    email: 'yuki@hana.dev',
    nickname: 'ゆき',
    nativeLang: 'ja',
    bio: '東京在住。韓国ドラマが好きで韓国語を勉強中です！',
  },
  { email: 'jiwoo@hana.dev', nickname: '지우', nativeLang: 'ko', bio: '서울에서 카페 해요. 일본 커피 문화가 궁금해요' },
  { email: 'seoyeon@hana.dev', nickname: '서연', nativeLang: 'ko', bio: '' },
  {
    email: 'haruto@hana.dev',
    nickname: 'はると',
    nativeLang: 'ja',
    bio: '大阪出身のエンジニア。釜山の美味しいお店を教えてください',
  },
  { email: 'sakura@hana.dev', nickname: 'さくら', nativeLang: 'ja', bio: 'K-POPが大好き！ソウルに留学予定です' },
  { email: 'ren@hana.dev', nickname: 'れん', nativeLang: 'ja', bio: '写真が趣味。済州島に行ってみたい' },
  { email: 'dohyun@hana.dev', nickname: '도현', nativeLang: 'ko', bio: '도쿄 출장이 잦아요. 현지 맛집 같이 찾아요' },
] as const;
const DEV_PASSWORD = 'password123';

if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에서는 시드를 넣지 않는다');

const db = await createDatabase(process.env.DATABASE_URL);
const passwordHash = await new PasswordHasher().hash(DEV_PASSWORD);
const inserted = await db
  .insert(users)
  .values(DEV_USERS.map((u) => ({ ...u, passwordHash })))
  .onConflictDoNothing({ target: users.email })
  .returning({ email: users.email });
console.log(`seed: ${inserted.length}명 추가 (${inserted.map((u) => u.email).join(', ') || '이미 있음'})`);
await db.$client.end();
