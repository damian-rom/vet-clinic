import { Body, Controller, Delete, Inject, Param, Patch, Post } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class PetsController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('pets')
  pet(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.pets.pet(user, body);
  }
  @Patch('pets/:id')
  editPet(@Actor() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.clinic.pets.pet(user, body, id);
  }
  @Delete('pets/:id')
  deletePet(@Actor() user: User, @Param('id') id: string) {
    return this.clinic.pets.deletePet(user, id);
  }
}
