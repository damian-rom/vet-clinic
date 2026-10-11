import type { User } from '@vet-clinic/types';
import { productSchema, stockMovementSchema } from '@vet-clinic/validation';
import { Store, type State } from '../infrastructure/sqlite/store';
import { fail, id, requireVet, find, isoNow } from '../domain/rules';
export class InventoryService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}
  createProduct(user: User, input: unknown) {
    requireVet(user);
    const data = productSchema.parse(input);
    return this.store.transaction((s) => {
      if (s.products.some((p) => p.name.toLowerCase() === data.name.toLowerCase()))
        fail('A product with this name already exists');
      const p = { ...data, id: id(), stock: 0 };
      s.products.push(p);
      return p;
    });
  }
  movement(user: User, input: unknown) {
    requireVet(user);
    const data = stockMovementSchema.parse(input);
    return this.store.transaction((s) => this.recordMovement(s, user, data));
  }
  recordMovement(
    s: State,
    user: User,
    data: {
      productId: string;
      quantity: number;
      type: 'Received' | 'Correction' | 'Used';
      reason?: string;
      appointmentId?: string;
    },
  ) {
    const product = find(s.products, data.productId);
    const stock = Math.round((product.stock + data.quantity) * 1e8) / 1e8;
    if (stock < 0) fail('Stock cannot become negative');
    const movement = { ...data, id: id(), performedBy: user.id, performedAt: isoNow(this.now) };
    product.stock = stock;
    s.movements.push(movement);
    return movement;
  }
}
