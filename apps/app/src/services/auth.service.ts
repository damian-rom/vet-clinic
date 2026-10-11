import { randomBytes } from 'node:crypto';
import type { User } from '@vet-clinic/types';
import { loginSchema, registrationSchema } from '@vet-clinic/validation';
import { Store, type Account, type State } from '../infrastructure/sqlite/store';
import {
  fail,
  id,
  publicUser,
  hashToken,
  find,
  passwordHash,
  passwordMatches,
  sameSecret,
} from '../domain/rules';
export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}
  register(input: unknown, staff = false) {
    const data = registrationSchema.parse(input);
    if (
      staff &&
      (!process.env.CLINIC_ACCESS_CODE ||
        !sameSecret(data.clinicCode || '', process.env.CLINIC_ACCESS_CODE))
    )
      fail('Invalid clinic access code', 403);
    if (!staff && data.clinicCode) fail('Use veterinarian registration', 400);
    const hash = passwordHash(data.password);
    return this.store.transaction((s) => {
      if (s.users.some((u) => u.email === data.email))
        fail('An account with that email already exists');
      const user: Account = {
        id: id(),
        name: data.name,
        email: data.email,
        role: staff ? 'vet' : 'owner',
        passwordHash: hash,
      };
      s.users.push(user);
      return this.issueSession(s, user);
    });
  }
  login(input: unknown) {
    const data = loginSchema.parse(input);
    const s = this.store.read();
    const user = s.users.find((u) => u.email === data.email);
    // Equalize the expensive work for unknown accounts.
    const hash = user?.passwordHash || `00000000000000000000000000000000:${'0'.repeat(128)}`;
    if (!passwordMatches(data.password, hash) || !user) fail('Email or password is incorrect', 401);
    return this.store.transaction((state) => this.issueSession(state, user!));
  }
  private issueSession(s: State, user: Account) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + 7 * 86400_000;
    s.sessions = s.sessions.filter((x) => x.expiresAt > this.now());
    s.sessions.push({ id: hashToken(token), userId: user.id, expiresAt });
    return { user: publicUser(user), token, expiresAt };
  }
  authenticate(token?: string): User {
    if (!token) fail('Please sign in', 401);
    const s = this.store.read();
    const session = s.sessions.find((x) => x.id === hashToken(token!) && x.expiresAt > this.now());
    if (!session) fail('Your session has expired. Please sign in again', 401);
    return publicUser(find(s.users, session!.userId));
  }
  logout(token?: string) {
    if (token)
      this.store.transaction((s) => {
        s.sessions = s.sessions.filter((x) => x.id !== hashToken(token));
      });
  }
}
