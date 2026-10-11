import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class InventoryController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('products')
  product(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.inventory.createProduct(user, body);
  }
  @Post('movements')
  movement(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.inventory.movement(user, body);
  }
}
