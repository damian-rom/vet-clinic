import type { TimeBlock } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { toTimeBlock } from '../records';
import { BaseRepository } from './base.repository';

export class TimeBlocksRepository extends BaseRepository<TimeBlock> {
  async find(blockId: string) {
    const row = await this.tx.timeBlock.findUnique({ where: { id: blockId } });
    return row && toTimeBlock(row);
  }
  async list(): Promise<TimeBlock[]> {
    return (
      await this.tx.timeBlock.findMany({ orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] })
    ).map(toTimeBlock);
  }
  /** Blocks that overlap the instants [from, to). */
  async overlapping(from: number, to: number): Promise<TimeBlock[]> {
    return (
      await this.tx.timeBlock.findMany({
        where: {
          startsAt: { lt: new Date(to).toISOString() },
          endsAt: { gt: new Date(from).toISOString() },
        },
      })
    ).map(toTimeBlock);
  }
  async create(data: { startsAt: string; endsAt: string; reason?: string }): Promise<TimeBlock> {
    return toTimeBlock(await this.tx.timeBlock.create({ data: { ...data, id: id() } }));
  }
  async delete(blockId: string) {
    await this.tx.timeBlock.delete({ where: { id: blockId } });
  }
}
