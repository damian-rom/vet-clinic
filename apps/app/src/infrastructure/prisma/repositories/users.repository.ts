import type { Role, User } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { userSelect } from '../records';
import { BaseRepository } from './base.repository';

const byName = [{ name: 'asc' }, { id: 'asc' }] as const;

export class UsersRepository extends BaseRepository<User> {
  find(userId: string) {
    return this.tx.user.findUnique({ where: { id: userId }, select: userSelect });
  }
  /** Includes the password hash; only sign-in should ask for it. */
  findWithPassword(email: string) {
    return this.tx.user.findUnique({ where: { email } });
  }
  async emailTaken(email: string) {
    return (await this.tx.user.count({ where: { email } })) > 0;
  }
  list(): Promise<User[]> {
    return this.tx.user.findMany({ select: userSelect, orderBy: [...byName] });
  }
  vets() {
    return this.tx.user.findMany({
      where: { role: 'vet' },
      select: { id: true, name: true },
      orderBy: [...byName],
    });
  }
  countVets() {
    return this.tx.user.count({ where: { role: 'vet' } });
  }
  create(data: { name: string; email: string; role: Role; passwordHash: string }): Promise<User> {
    return this.tx.user.create({ data: { ...data, id: id() }, select: userSelect });
  }
}
