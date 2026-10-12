import type { Database, Tx } from '@vet-clinic/db';
import type { User } from '@vet-clinic/types';
import { productSchema, stockMovementSchema } from '@vet-clinic/validation';
import { fail, id, requireVet, required, isoNow } from '../domain/rules';
import { toMovement } from '../infrastructure/prisma/records';
export class InventoryService {
  constructor(
    private readonly db: Database,
    private readonly now: () => number,
  ) {}
  async createProduct(user: User, input: unknown) {
    requireVet(user);
    const data = productSchema.parse(input);
    return this.db.write(async (tx) => {
      const names = await tx.product.findMany({ select: { name: true } });
      if (names.some((p) => p.name.toLowerCase() === data.name.toLowerCase()))
        fail('A product with this name already exists');
      return tx.product.create({ data: { ...data, id: id(), stock: 0 } });
    });
  }
  async movement(user: User, input: unknown) {
    requireVet(user);
    const data = stockMovementSchema.parse(input);
    return this.db.write((tx) => this.recordMovement(tx, user, data));
  }
  async recordMovement(
    tx: Tx,
    user: User,
    data: {
      productId: string;
      quantity: number;
      type: 'Received' | 'Correction' | 'Used';
      reason?: string;
      appointmentId?: string;
    },
  ) {
    const product = required(await tx.product.findUnique({ where: { id: data.productId } }));
    const stock = Math.round((product.stock + data.quantity) * 1e8) / 1e8;
    if (stock < 0) fail('Stock cannot become negative');
    await tx.product.update({ where: { id: product.id }, data: { stock } });
    const movement = await tx.movement.create({
      data: { ...data, id: id(), performedBy: user.id, performedAt: isoNow(this.now) },
    });
    return toMovement(movement);
  }
}
