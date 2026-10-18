import type { VisitType } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { BaseRepository } from './base.repository';

const byName = [{ name: 'asc' }, { id: 'asc' }] as const;

export class VisitTypesRepository extends BaseRepository<VisitType> {
  find(typeId: string) {
    return this.tx.visitType.findUnique({ where: { id: typeId } });
  }
  list(): Promise<VisitType[]> {
    return this.tx.visitType.findMany({ orderBy: [...byName] });
  }
  listActive(): Promise<VisitType[]> {
    return this.tx.visitType.findMany({ where: { retired: false }, orderBy: [...byName] });
  }
  /** Visit type names are unique regardless of letter case. */
  async nameTaken(name: string, exceptId?: string) {
    const types = await this.tx.visitType.findMany({ select: { id: true, name: true } });
    return types.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
  }
  /** Whether any saved plan or AI draft refers to this type. */
  async inUse(typeId: string) {
    return (
      (await this.tx.appointmentPlan.count({ where: { visitTypeId: typeId } })) > 0 ||
      (await this.tx.appointmentAiDraft.count({ where: { visitTypeId: typeId } })) > 0
    );
  }
  create(data: { name: string; retired: boolean }): Promise<VisitType> {
    return this.tx.visitType.create({ data: { ...data, id: id() } });
  }
  update(typeId: string, data: { name: string; retired?: boolean }): Promise<VisitType> {
    return this.tx.visitType.update({ where: { id: typeId }, data });
  }
  async delete(typeId: string) {
    await this.tx.visitType.delete({ where: { id: typeId } });
  }
}
