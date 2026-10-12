import { randomBytes } from 'node:crypto';
import type { Database, Tx } from '@vet-clinic/db';
import type { User } from '@vet-clinic/types';
import { loginSchema, registrationSchema } from '@vet-clinic/validation';
import { fail, id, hashToken, passwordHash, passwordMatches, sameSecret } from '../domain/rules';
import { toUser, userSelect } from '../infrastructure/prisma/records';
export class AuthService {
  constructor(
    private readonly db: Database,
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
    return this.db.write(async (tx) => {
      if (await tx.user.findUnique({ where: { email: data.email } }))
        fail('An account with that email already exists');
      const user = await tx.user.create({
        data: {
          id: id(),
          name: data.name,
          email: data.email,
          role: staff ? 'vet' : 'owner',
          passwordHash: hash,
        },
        select: userSelect,
      });
      return this.issueSession(tx, user);
    });
  }
  async login(input: unknown) {
    const data = loginSchema.parse(input);
    const user = await this.db.read((tx) => tx.user.findUnique({ where: { email: data.email } }));
    // Equalize the expensive work for unknown accounts.
    const hash = user?.passwordHash || `00000000000000000000000000000000:${'0'.repeat(128)}`;
    if (!passwordMatches(data.password, hash) || !user) fail('Email or password is incorrect', 401);
    return this.db.write((tx) => this.issueSession(tx, toUser(user!)));
  }
  private async issueSession(tx: Tx, user: User) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + 7 * 86400_000;
    await tx.session.deleteMany({ where: { expiresAt: { lte: BigInt(this.now()) } } });
    await tx.session.create({
      data: { id: hashToken(token), userId: user.id, expiresAt: BigInt(expiresAt) },
    });
    return { user: toUser(user), token, expiresAt };
  }
  async authenticate(token?: string): Promise<User> {
    if (!token) fail('Please sign in', 401);
    const session = await this.db.read((tx) =>
      tx.session.findFirst({
        where: { id: hashToken(token!), expiresAt: { gt: BigInt(this.now()) } },
        include: { user: { select: userSelect } },
      }),
    );
    if (!session) fail('Your session has expired. Please sign in again', 401);
    return toUser(session!.user);
  }
  async logout(token?: string) {
    if (token)
      await this.db.write((tx) => tx.session.deleteMany({ where: { id: hashToken(token) } }));
  }
}
