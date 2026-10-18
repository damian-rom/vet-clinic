import type { Product } from '@vet-clinic/types';
import { id } from '../../../domain/rules';
import { BaseRepository } from './base.repository';

export class ProductsRepository extends BaseRepository<Product> {
  find(productId: string) {
    return this.tx.product.findUnique({ where: { id: productId } });
  }
  list(): Promise<Product[]> {
    return this.tx.product.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }
  /** Product names are unique regardless of letter case. */
  async nameTaken(name: string) {
    const products = await this.tx.product.findMany({ select: { name: true } });
    return products.some((p) => p.name.toLowerCase() === name.toLowerCase());
  }
  async allExist(productIds: string[]) {
    return (
      (await this.tx.product.count({ where: { id: { in: productIds } } })) === productIds.length
    );
  }
  create(data: { name: string; unit: string }): Promise<Product> {
    return this.tx.product.create({ data: { ...data, id: id(), stock: 0 } });
  }
  async setStock(productId: string, stock: number) {
    await this.tx.product.update({ where: { id: productId }, data: { stock } });
  }
}
