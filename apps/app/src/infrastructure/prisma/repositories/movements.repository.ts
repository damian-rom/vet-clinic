import type { MovementType, StockMovement } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { toMovement } from '../records';
import { BaseRepository } from './base.repository';

const byTime = [{ performedAt: 'asc' }, { id: 'asc' }] as const;

/** Stock movements are an append-only ledger; product stock is their running total. */
export class MovementsRepository extends BaseRepository<StockMovement> {
  async find(movementId: string) {
    const row = await this.tx.movement.findUnique({ where: { id: movementId } });
    return row && toMovement(row);
  }
  async list(): Promise<StockMovement[]> {
    return (await this.tx.movement.findMany({ orderBy: [...byTime] })).map(toMovement);
  }
  async create(data: {
    productId: string;
    type: MovementType;
    quantity: number;
    reason?: string;
    appointmentId?: string;
    performedBy: string;
    performedAt: string;
  }): Promise<StockMovement> {
    return toMovement(await this.tx.movement.create({ data: { ...data, id: id() } }));
  }
  /** Movements in [from, to), optionally only those used for one pet's visits. */
  forReport(range: { gte: string; lt: string }, petId?: string) {
    return this.tx.movement.findMany({
      where: { performedAt: range, ...(petId ? { appointment: { petId } } : {}) },
      include: {
        product: { select: { name: true, unit: true } },
        performer: { select: { name: true } },
      },
      orderBy: [...byTime],
    });
  }
}
