import type { User } from '@vet-clinic/types';
import { productSchema, stockMovementSchema } from '@vet-clinic/validation';
import { fail, requireVet, isoNow } from '../domain/rules';
import type { Repositories, Store } from '../infrastructure/prisma/repositories';
export class InventoryService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}
  async createProduct(user: User, input: unknown) {
    requireVet(user);
    const data = productSchema.parse(input);
    return this.store.write(async (repos) => {
      if (await repos.products.nameTaken(data.name))
        fail('A product with this name already exists');
      return repos.products.create(data);
    });
  }
  async movement(user: User, input: unknown) {
    requireVet(user);
    const data = stockMovementSchema.parse(input);
    return this.store.write((repos) => this.recordMovement(repos, user, data));
  }
  async recordMovement(
    repos: Repositories,
    user: User,
    data: {
      productId: string;
      quantity: number;
      type: 'Received' | 'Correction' | 'Used';
      reason?: string;
      appointmentId?: string;
    },
  ) {
    const product = await repos.products.get(data.productId);
    const stock = Math.round((product.stock + data.quantity) * 1e8) / 1e8;
    if (stock < 0) fail('Stock cannot become negative');
    await repos.products.setStock(product.id, stock);
    return repos.movements.create({
      ...data,
      performedBy: user.id,
      performedAt: isoNow(this.now),
    });
  }
}
