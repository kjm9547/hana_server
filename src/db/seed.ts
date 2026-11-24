import { PasswordHasher } from '@nestjs/authentication';
import { createDatabase } from './database.js';
import { users } from './schema.js';

// 프론트 로그인 화면의 "테스트 로그인" 버튼이 쓰는 개발용 계정. 이미 있으면 건너뛴다.
const DEV_USERS = [
  { email: 'minsu@hana.dev', nickname: '민수', nativeLang: 'ko' },
  { email: 'yuki@hana.dev', nickname: 'ゆき', nativeLang: 'ja' },
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
