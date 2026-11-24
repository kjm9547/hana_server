import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gt, ne } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { users } from '../db/schema.js';

// 남에게 보여도 되는 컬럼 / 본인에게만 보이는 컬럼. password_hash는 이 파일 밖으로 나가지 않는다.
export const publicCols = { id: users.id, nickname: users.nickname, nativeLang: users.nativeLang, bio: users.bio };
const meCols = { ...publicCols, email: users.email, createdAt: users.createdAt };

export type User = Omit<typeof users.$inferSelect, 'passwordHash'>;
type NewUser = Pick<typeof users.$inferInsert, 'email' | 'passwordHash' | 'nickname' | 'nativeLang'>;

@Injectable()
export class UsersRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async create(data: NewUser): Promise<User> {
    try {
      const [user] = await this.db.insert(users).values(data).returning(meCols);
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    }
  }

  async findCredentials(email: string) {
    const [row] = await this.db
      .select({ ...meCols, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email));
    if (!row) return null;
    const { passwordHash, ...user } = row;
    return { user, passwordHash };
  }

  async findById(id: number): Promise<User | null> {
    const [user] = await this.db.select(meCols).from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async findPublicById(id: number) {
    const [user] = await this.db.select(publicCols).from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async update(id: number, changes: { nickname?: string; bio?: string }): Promise<User> {
    const [user] = await this.db.update(users).set(changes).where(eq(users.id, id)).returning(meCols);
    if (!user) throw new NotFoundException();
    return user;
  }

  /** 언어교환 상대: 모국어가 나와 다른 사람. limit+1개를 읽어 다음 페이지 유무를 판단. */
  async partners(me: User, limit: number, after?: number) {
    const rows = await this.db
      .select(publicCols)
      .from(users)
      .where(and(ne(users.nativeLang, me.nativeLang), after ? gt(users.id, after) : undefined))
      .orderBy(asc(users.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }
}

/** Drizzle은 드라이버 에러를 감싸므로 cause 체인을 따라간다. 23505 = Postgres unique_violation */
function isUniqueViolation(error: unknown): boolean {
  for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === '23505') return true;
  }
  return false;
}
