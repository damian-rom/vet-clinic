import type { Case } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { caseInclude, toCase } from '../records';
import { BaseRepository } from './base.repository';

const caseOrder = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

export class CasesRepository extends BaseRepository<Case> {
  async find(caseId: string) {
    const row = await this.tx.case.findUnique({ where: { id: caseId }, include: caseInclude });
    return row && toCase(row);
  }
  async list(): Promise<Case[]> {
    return (await this.tx.case.findMany({ include: caseInclude, orderBy: [...caseOrder] })).map(
      toCase,
    );
  }
  async listByOwner(ownerId: string): Promise<Case[]> {
    return (
      await this.tx.case.findMany({
        where: { pet: { ownerId } },
        include: caseInclude,
        orderBy: [...caseOrder],
      })
    ).map(toCase);
  }
  /** A new case with no checkpoints; attach them through the appointments repository. */
  async create(data: { petId: string; name: string; createdAt: string }): Promise<Case> {
    return toCase(await this.tx.case.create({ data: { ...data, id: id() }, include: caseInclude }));
  }
}
