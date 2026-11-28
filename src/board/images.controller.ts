import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ImageStorage } from '../storage/image-storage.js';
import { BoardRepository } from './board.repository.js';

const MAX_BYTES = 10 * 1024 * 1024;

// 확장자나 클라이언트가 보낸 형식을 믿지 않고 파일 앞부분(매직 넘버)으로 판별한다
const KINDS = [
  { ext: 'jpg', type: 'image/jpeg', is: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', type: 'image/png', is: (b: Buffer) => b.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n' },
  {
    ext: 'webp',
    type: 'image/webp',
    is: (b: Buffer) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
];
const filenameSchema = z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/);

@Controller('images')
export class ImagesController {
  constructor(
    private readonly board: BoardRepository,
    private readonly storage: ImageStorage,
  ) {}

  /** multipart의 file 필드로 사진 한 장. { id, url }을 돌려주고, 글을 쓸 때 imageIds로 붙인다. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@CurrentUser('id') meId: number, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Image file is required (multipart field "file")');
    const kind = KINDS.find((k) => k.is(file.buffer));
    if (!kind) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const filename = `${randomUUID()}.${kind.ext}`;
    await this.storage.put(filename, file.buffer, kind.type);
    return { id: await this.board.addImage(meId, filename), url: this.storage.url(filename) };
  }

  // local 저장소일 때 서버가 직접 내려주는 주소. s3로 바꾸면 앱이 버킷 주소로 받아서 여기로 오지 않는다.
  // 앱의 <Image>가 헤더 없이 불러오도록 공개. 파일 이름이 추측할 수 없는 UUID라 목록 없이 찾을 수 없다.
  @Public()
  @Get(':filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('filename', { schema: filenameSchema }) filename: string) {
    const data = await this.storage.read(filename);
    if (!data) throw new NotFoundException('Image not found');
    const kind = KINDS.find((k) => filename.endsWith(`.${k.ext}`))!;
    return new StreamableFile(data, { type: kind.type });
  }
}
