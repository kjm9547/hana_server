import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider } from '@nestjs/common';

/**
 * 사진 파일 저장소. DB에는 키(파일 이름)만 두고, 파일을 어디에 두고 어떤 주소로 보여줄지는 여기서 정한다.
 * 드라이버는 STORAGE_DRIVER로 고른다: local(기본, 서버 폴더) · s3(나중에 연결).
 */
export abstract class ImageStorage {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** 서버가 직접 내려줄 때만 쓴다 (GET /images/:key). 없으면 null */
  abstract read(key: string): Promise<Buffer | null>;
  /** 없는 키는 무시한다 */
  abstract remove(keys: string[]): Promise<void>;
  /** 앱에 줄 주소. '/'로 시작하면 API 서버 기준 경로, 'https://'면 그대로 쓴다 */
  abstract url(key: string): string;
}

/** 서버 폴더에 저장하고 GET /images/:key 로 내려준다. 배포할 때 이 폴더를 볼륨으로 유지할 것. */
export class LocalImageStorage extends ImageStorage {
  constructor(private readonly dir: string) {
    super();
  }

  async put(key: string, data: Buffer) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), data);
  }

  read(key: string) {
    return readFile(join(this.dir, key)).catch(() => null);
  }

  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => unlink(join(this.dir, k)).catch(() => undefined)));
  }

  url(key: string) {
    return `/images/${key}`;
  }
}

// ponytail: S3 연결 때 S3ImageStorage를 만든다. put = PutObject(ContentType 포함), remove = DeleteObjects,
// read = null (앱은 S3·CDN 주소로 바로 받는다), url = `${S3_PUBLIC_BASE_URL}/${key}`. 환경 변수는 .env.example 참고.
// 기존 로컬 파일은 같은 키로 버킷에 올리면 DB를 바꿀 필요가 없다.

export function createImageStorage(env: NodeJS.ProcessEnv = process.env): ImageStorage {
  const driver = env.STORAGE_DRIVER ?? 'local';
  if (driver === 'local') return new LocalImageStorage(env.UPLOAD_DIR ?? 'uploads');
  throw new Error(`STORAGE_DRIVER '${driver}'는 아직 없습니다 (local만 지원, s3는 연결 예정)`);
}

export const imageStorageProvider: Provider = { provide: ImageStorage, useFactory: () => createImageStorage() };
