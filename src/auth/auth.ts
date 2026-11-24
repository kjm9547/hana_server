import { Body, Controller, HttpCode, Injectable, Post, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
  PasswordHasher,
  Public,
  TokenService,
} from '@nestjs/authentication';
import { z } from 'zod';
import { LANGS } from '../db/schema.js';
import { type User, UsersRepository } from '../users/users.repository.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
    refreshTokens: false;
  }
}

const email = z.string().trim().toLowerCase().pipe(z.email());
const signUpSchema = z.object({
  email,
  password: z.string().min(8).max(128),
  nickname: z.string().trim().min(1).max(30),
  nativeLang: z.enum(LANGS),
});
const signInSchema = z.object({ email, password: z.string().min(1).max(128) });

@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this, { order: 1 });
  }

  // 매 요청마다 DB에서 유저를 다시 읽는다: 탈퇴/정지가 즉시 반영됨.
  validate({ sub }: JwtClaims) {
    return sub ? this.users.findById(Number(sub)) : null;
  }
}

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  @Post('register')
  async register(@Body({ schema: signUpSchema }) body: z.infer<typeof signUpSchema>) {
    const { password, ...rest } = body;
    const user = await this.users.create({ ...rest, passwordHash: await this.hasher.hash(password) });
    return this.tokens.issue(String(user.id), { method: 'password' });
  }

  @Post('token')
  @HttpCode(200)
  async signIn(@Body({ schema: signInSchema }) body: z.infer<typeof signInSchema>) {
    const found = await this.users.findCredentials(body.email);
    // 없는 이메일도 더미 해시로 검증 → 응답 시간으로 가입 여부가 드러나지 않음
    const valid = await this.hasher.verify(body.password, found?.passwordHash);
    if (!valid || !found) throw new UnauthorizedException('Invalid email or password');
    return this.tokens.issue(String(found.user.id), { method: 'password' });
  }
}
