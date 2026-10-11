import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class CasesController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('cases')
  createCase(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.cases.createCase(user, body);
  }
  @Post('cases/:id/checkpoints')
  checkpoint(@Actor() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.clinic.cases.checkpoint(user, id, body);
  }
  @Post('cases/:id/attach')
  attach(@Actor() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.clinic.cases.attachCheckpoint(user, id, body);
  }
}
