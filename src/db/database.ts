import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

export type Database = NodePgDatabase & { $client: Pool };

// e2e·CI용: Docker 없이 프로세스 안에서 도는 인메모리 Postgres(PGlite)
export const PGLITE_MEMORY_URL = 'pglite://memory';

/** DATABASE_URL로 DB를 열고 migration까지 적용한다. */
export async function createDatabase(url: string | undefined): Promise<Database> {
  if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다 (.env.example 참고)');
  if (url === PGLITE_MEMORY_URL) {
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
    const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');
    const db = drizzlePglite();
    await migratePglite(db, { migrationsFolder: './drizzle' });
    // 같은 Postgres 쿼리 빌더라 런타임 동작은 같고, 드라이버 타입만 다르다
    return db as unknown as Database;
  }
  const db = drizzle({ connection: url });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}
