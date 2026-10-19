import type { WeeklyTimeBlock } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { toWeeklyTimeBlock } from '../records';
import { BaseRepository } from './base.repository';

export class WeeklyTimeBlocksRepository extends BaseRepository<WeeklyTimeBlock> {
  async find(blockId: string) {
    const row = await this.tx.weeklyTimeBlock.findUnique({ where: { id: blockId } });
    return row && toWeeklyTimeBlock(row);
  }
  async list(): Promise<WeeklyTimeBlock[]> {
    return (
      await this.tx.weeklyTimeBlock.findMany({
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
      })
    ).map(toWeeklyTimeBlock);
  }
  async create(data: Omit<WeeklyTimeBlock, 'id'>): Promise<WeeklyTimeBlock> {
    return toWeeklyTimeBlock(await this.tx.weeklyTimeBlock.create({ data: { ...data, id: id() } }));
  }
  async delete(blockId: string) {
    await this.tx.weeklyTimeBlock.delete({ where: { id: blockId } });
  }
}
