import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      JWT_SECRET: 'e2e-test-secret-that-is-at-least-32-bytes!',
      DATABASE_URL: 'pglite://memory',
      // 사진 업로드 테스트가 쓰는 폴더. 레포의 uploads/와 섞이지 않게
      UPLOAD_DIR: join(tmpdir(), 'hana-e2e-uploads'),
    },
  },
});
