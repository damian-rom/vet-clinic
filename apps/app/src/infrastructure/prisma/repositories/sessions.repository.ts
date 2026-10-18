import type { User } from '@vet-clinic/types';
import { userSelect } from '../records';
import { BaseRepository } from './base.repository';

/** Sessions are keyed by the SHA-256 of their token; the token itself is never stored. */
export class SessionsRepository extends BaseRepository<{ id: string; userId: string }> {
  find(tokenHash: string) {
    return this.tx.session.findUnique({
      where: { id: tokenHash },
      select: { id: true, userId: true },
    });
  }
  /** The signed-in user, when the session exists and has not expired at `now`. */
  async user(tokenHash: string, now: number): Promise<User | null> {
    const session = await this.tx.session.findFirst({
      where: { id: tokenHash, expiresAt: { gt: BigInt(now) } },
      select: { user: { select: userSelect } },
    });
    return session?.user ?? null;
  }
  async create(tokenHash: string, userId: string, expiresAt: number) {
    await this.tx.session.create({
      data: { id: tokenHash, userId, expiresAt: BigInt(expiresAt) },
    });
  }
  async delete(tokenHash: string) {
    await this.tx.session.deleteMany({ where: { id: tokenHash } });
  }
  async deleteExpired(now: number) {
    await this.tx.session.deleteMany({ where: { expiresAt: { lte: BigInt(now) } } });
  }
}
