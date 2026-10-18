import { randomBytes } from 'node:crypto';
import type { User } from '@vet-clinic/types';
import { loginSchema, registrationSchema } from '@vet-clinic/validation';
import { fail, hashToken, passwordHash, passwordMatches, sameSecret } from '../domain/rules';
import type { Repositories, Store } from '../infrastructure/prisma/repositories';
import { toUser } from '../infrastructure/prisma/records';
export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}
  async register(input: unknown, staff = false) {
    const data = registrationSchema.parse(input);
    if (
      staff &&
      (!process.env.CLINIC_ACCESS_CODE ||
        !sameSecret(data.clinicCode || '', process.env.CLINIC_ACCESS_CODE))
    )
      fail('Invalid clinic access code', 403);
    if (!staff && data.clinicCode) fail('Use veterinarian registration', 400);
    const hash = passwordHash(data.password);
    return this.store.write(async (repos) => {
      if (await repos.users.emailTaken(data.email))
        fail('An account with that email already exists');
      const user = await repos.users.create({
        name: data.name,
        email: data.email,
        role: staff ? 'vet' : 'owner',
        passwordHash: hash,
      });
      return this.issueSession(repos, user);
    });
  }
  async login(input: unknown) {
    const data = loginSchema.parse(input);
    const user = await this.store.read((repos) => repos.users.findWithPassword(data.email));
    // Equalize the expensive work for unknown accounts.
    const hash = user?.passwordHash || `00000000000000000000000000000000:${'0'.repeat(128)}`;
    if (!passwordMatches(data.password, hash) || !user) fail('Email or password is incorrect', 401);
    return this.store.write((repos) => this.issueSession(repos, toUser(user!)));
  }
  private async issueSession(repos: Repositories, user: User) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + 7 * 86400_000;
    await repos.sessions.deleteExpired(this.now());
    await repos.sessions.create(hashToken(token), user.id, expiresAt);
    return { user: toUser(user), token, expiresAt };
  }
  async authenticate(token?: string): Promise<User> {
    if (!token) fail('Please sign in', 401);
    const user = await this.store.read((repos) =>
      repos.sessions.user(hashToken(token!), this.now()),
    );
    if (!user) fail('Your session has expired. Please sign in again', 401);
    return toUser(user!);
  }
  async logout(token?: string) {
    if (token) await this.store.write((repos) => repos.sessions.delete(hashToken(token)));
  }
}
