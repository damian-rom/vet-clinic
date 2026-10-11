import { Module } from '@nestjs/common';
import { CasesController } from '../controllers/cases.controller';

@Module({ controllers: [CasesController] })
export class CasesModule {}
