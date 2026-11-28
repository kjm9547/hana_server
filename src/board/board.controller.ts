import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { BoardRepository } from './board.repository.js';
import { ImageStorage } from '../storage/image-storage.js';

const id = z.coerce.number().int().positive();
const createSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
  // POST /images로 미리 올린 사진 id, 보여줄 순서대로 최대 10장
  imageIds: z.array(id).max(10).default([]),
});
const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: id.optional(),
});

/** 게시판: 로그인한 사람은 누구나 읽고 쓴다. 지우기는 작성자만. */
@Controller('posts')
export class BoardController {
  constructor(
    private readonly board: BoardRepository,
    private readonly storage: ImageStorage,
  ) {}

  /** 사진 키를 앱이 쓸 주소로 바꾼다 */
  private withUrls<T extends { imageKeys: string[] }>({ imageKeys, ...post }: T) {
    return { ...post, images: imageKeys.map((k) => this.storage.url(k)) };
  }

  @Get()
  async list(@Query({ schema: pageSchema }) q: z.infer<typeof pageSchema>) {
    const page = await this.board.list(q.limit, q.before);
    return { ...page, items: page.items.map((p) => this.withUrls(p)) };
  }

  @Post()
  async create(@CurrentUser('id') meId: number, @Body({ schema: createSchema }) body: z.infer<typeof createSchema>) {
    if (new Set(body.imageIds).size !== body.imageIds.length) throw new BadRequestException('Duplicate image ids');
    const postId = await this.board.create(meId, body);
    if (postId === null) throw new BadRequestException('Images must be your own uploads not attached to another post');
    return this.withUrls((await this.board.detail(postId, meId))!);
  }

  @Get(':id')
  async detail(@CurrentUser('id') meId: number, @Param('id', { schema: id }) postId: number) {
    const post = await this.board.detail(postId, meId);
    if (!post) throw new NotFoundException('Post not found');
    return this.withUrls(post);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser('id') meId: number, @Param('id', { schema: id }) postId: number) {
    if ((await this.requireAuthor(postId)) !== meId) throw new ForbiddenException('Only the author can delete');
    await this.storage.remove(await this.board.remove(postId));
  }

  @Post(':id/comments')
  async comment(
    @CurrentUser('id') meId: number,
    @Param('id', { schema: id }) postId: number,
    @Body({ schema: commentSchema }) { body }: z.infer<typeof commentSchema>,
  ) {
    await this.requireAuthor(postId);
    return this.board.addComment(postId, meId, body);
  }

  @Put(':id/like')
  async like(@CurrentUser('id') meId: number, @Param('id', { schema: id }) postId: number) {
    await this.requireAuthor(postId);
    return this.board.setLike(postId, meId, true);
  }

  @Delete(':id/like')
  async unlike(@CurrentUser('id') meId: number, @Param('id', { schema: id }) postId: number) {
    await this.requireAuthor(postId);
    return this.board.setLike(postId, meId, false);
  }

  /** 글이 있으면 작성자 id, 없으면 404 */
  private async requireAuthor(postId: number) {
    const authorId = await this.board.findAuthorId(postId);
    if (authorId === null) throw new NotFoundException('Post not found');
    return authorId;
  }
}
