import { Module } from '@nestjs/common';
import { InventoryController } from '../controllers/inventory.controller';

@Module({ controllers: [InventoryController] })
export class InventoryModule {}
