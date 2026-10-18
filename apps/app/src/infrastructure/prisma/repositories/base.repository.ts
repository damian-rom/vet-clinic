import type { Tx } from '@vet-clinic/db';
import { required } from '../../../domain/rules';

/**
 * Data access for one table (or aggregate) inside one transaction. Repositories are created
 * per transaction by `Store`, so every call shares that transaction's snapshot and lock.
 */
export abstract class BaseRepository<Entity> {
  constructor(protected readonly tx: Tx) {}

  /** The record, or null when no row has this id. */
  abstract find(id: string): Promise<Entity | null>;

  /** The record, or a 404 the API reports as "Record not found". */
  async get(id: string): Promise<Entity> {
    return required(await this.find(id));
  }
}
