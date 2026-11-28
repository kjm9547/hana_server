import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImageStorage, type ImageStorage, LocalImageStorage } from './image-storage.js';

describe('사진 저장소', () => {
  it('드라이버: 기본은 local, 모르는 드라이버는 시작할 때 바로 실패', () => {
    expect(createImageStorage({})).toBeInstanceOf(LocalImageStorage);
    expect(createImageStorage({ STORAGE_DRIVER: 'local' })).toBeInstanceOf(LocalImageStorage);
    expect(() => createImageStorage({ STORAGE_DRIVER: 's3' })).toThrow(/s3/);
  });

  it('local: 저장 → 읽기 → 지우기, 주소는 API 서버 경로', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hana-storage-'));
    const storage: ImageStorage = new LocalImageStorage(join(dir, 'uploads')); // 폴더가 없어도 처음 저장할 때 만든다
    try {
      await storage.put('a.png', Buffer.from('png-bytes'), 'image/png');
      expect((await storage.read('a.png'))?.toString()).toBe('png-bytes');
      expect(storage.url('a.png')).toBe('/images/a.png');
      await storage.remove(['a.png', 'missing.png']); // 없는 파일은 무시
      expect(await storage.read('a.png')).toBeNull();
      expect(await readdir(join(dir, 'uploads'))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
