import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';

if (existsSync('.env')) process.loadEnvFile();
// .env를 읽은 뒤에 불러와야 AppModule이 JWT_SECRET을 본다
const { AppModule } = await import('./app.module.js');

// 인증은 쿠키 없이 Bearer 토큰만 쓰므로 모든 origin 허용해도 CSRF 위험 없음 (웹 빌드용)
const app = await NestFactory.create(AppModule, { cors: true });
await app.listen(process.env.PORT ?? 3000);
