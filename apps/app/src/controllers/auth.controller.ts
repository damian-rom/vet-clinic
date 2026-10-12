import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Clinic } from '../clinic';
import { CLINIC, sessionToken } from '../http';
@Controller()
export class AuthController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('auth/register')
  register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.signedIn(this.clinic.auth.register(body), res);
  }
  @Post('auth/register-vet')
  registerVet(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.signedIn(this.clinic.auth.register(body, true), res);
  }
  @Post('auth/login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.signedIn(this.clinic.auth.login(body), res);
  }
  @Post('auth/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.clinic.auth.logout(sessionToken(req));
    this.cookie(res, '', 0);
    return { ok: true };
  }
  private cookie(res: Response, token: string, age: number) {
    res.setHeader(
      'Set-Cookie',
      `vet_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`,
    );
  }
  private async signedIn(pending: ReturnType<Clinic['auth']['login']>, res: Response) {
    const result = await pending;
    this.cookie(res, result.token, 7 * 86400);
    return { user: result.user };
  }
}
