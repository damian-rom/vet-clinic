import { Module } from '@nestjs/common';
import { PetsController } from '../controllers/pets.controller';

@Module({ controllers: [PetsController] })
export class PetsModule {}
