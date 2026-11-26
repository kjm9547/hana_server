import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, isNull, lt, sql, TransactionRollbackError } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { postComments, postImages, postLikes, posts, users } from '../db/schema.js';
import { publicCols } from '../users/users.repository.js';

type NewPost = { title: string; body: string; imageIds: number[] };

// 목록·상세 공통: 글 + 작성자 공개 프로필 + 사진 키(순서대로) + 댓글 수 + 좋아요 수
const commentCount = sql<number>`(select count(*)::int from ${postComments} where ${postComments.postId} = ${posts.id})`;
const likeCount = sql<number>`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${posts.id})`;
// 사진 키(파일 이름)를 순서대로. 주소로 바꾸는 건 ImageStorage가 한다 (local · s3)
const imageKeys = sql<
  string[]
>`coalesce((select array_agg(${postImages.filename} order by ${postImages.position}) from ${postImages} where ${postImages.postId} = ${posts.id}), '{}')`;
const postCols = {
  id: posts.id,
  title: posts.title,
  body: posts.body,
  createdAt: posts.createdAt,
  author: publicCols,
  imageKeys,
  commentCount,
  likeCount,
};

@Injectable()
export class BoardRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** 최신순. before(글 id)보다 오래된 것을 limit개. limit+1개를 읽어 다음 페이지 유무를 판단. */
  async list(limit: number, before?: number) {
    const rows = await this.db
      .select(postCols)
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(before ? lt(posts.id, before) : undefined)
      .orderBy(desc(posts.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  /** 글 상세 + 내가 좋아요 눌렀는지 + 댓글(오래된 순). 없으면 null. */
  // ponytail: 댓글 페이징 없음. 댓글이 수백 개 달리는 글이 생기면 id 커서로.
  async detail(postId: number, meId: number) {
    const [post] = await this.db
      .select({
        ...postCols,
        likedByMe: sql<boolean>`exists (select 1 from ${postLikes} where ${postLikes.postId} = ${posts.id} and ${postLikes.userId} = ${meId})`,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(eq(posts.id, postId));
    if (!post) return null;
    const comments = await this.db
      .select({ id: postComments.id, body: postComments.body, createdAt: postComments.createdAt, author: publicCols })
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.authorId))
      .where(eq(postComments.postId, postId))
      .orderBy(asc(postComments.id));
    return { ...post, comments };
  }

  /**
   * 글을 만들고 미리 올려 둔 사진을 순서대로 붙인다. 내가 올렸고 아직 어디에도 안 붙은 사진만 된다.
   * 하나라도 안 되면 글도 만들지 않고 null.
   */
  async create(authorId: number, { imageIds, ...data }: NewPost): Promise<number | null> {
    return this.db
      .transaction(async (tx) => {
        const [{ id }] = await tx
          .insert(posts)
          .values({ authorId, ...data })
          .returning({ id: posts.id });
        for (const [position, imageId] of imageIds.entries()) {
          const attached = await tx
            .update(postImages)
            .set({ postId: id, position })
            .where(and(eq(postImages.id, imageId), eq(postImages.uploaderId, authorId), isNull(postImages.postId)))
            .returning({ id: postImages.id });
          if (attached.length === 0) {
            tx.rollback();
          }
        }
        return id;
      })
      .catch((error: unknown) => {
        if (error instanceof TransactionRollbackError) return null;
        throw error;
      });
  }

  /** 올린 사진을 기록한다. 아직 글에 붙지 않은 상태. */
  // ponytail: 올리고 글을 안 쓴 사진은 그대로 남는다. 쌓이면 하루 지난 post_id 없는 사진을 지우는 정리 작업으로.
  async addImage(uploaderId: number, filename: string) {
    const [image] = await this.db.insert(postImages).values({ uploaderId, filename }).returning({ id: postImages.id });
    return image.id;
  }

  async findAuthorId(postId: number): Promise<number | null> {
    const [row] = await this.db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, postId));
    return row?.authorId ?? null;
  }

  /** 글을 지우고(댓글·좋아요·사진 기록은 cascade) 저장소에서 지워야 할 사진 키를 돌려준다 */
  async remove(postId: number): Promise<string[]> {
    const files = await this.db
      .select({ filename: postImages.filename })
      .from(postImages)
      .where(eq(postImages.postId, postId));
    await this.db.delete(posts).where(eq(posts.id, postId));
    return files.map((f) => f.filename);
  }

  async addComment(postId: number, authorId: number, body: string) {
    const [comment] = await this.db
      .insert(postComments)
      .values({ postId, authorId, body })
      .returning({ id: postComments.id, body: postComments.body, createdAt: postComments.createdAt });
    const [author] = await this.db.select(publicCols).from(users).where(eq(users.id, authorId));
    return { ...comment, author };
  }

  /** 좋아요를 켜거나 끄고 바뀐 상태를 돌려준다. 이미 같은 상태면 아무 일도 없다. */
  async setLike(postId: number, userId: number, liked: boolean) {
    if (liked) await this.db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
    else await this.db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(postLikes)
      .where(eq(postLikes.postId, postId));
    return { liked, likeCount: count };
  }
}
