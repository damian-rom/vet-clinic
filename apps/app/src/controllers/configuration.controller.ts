import { Body, Controller, Delete, Inject, Param, Patch, Post } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class ConfigurationController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('visit-types')
  visitType(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.configuration.visitType(user, body);
  }
  @Patch('visit-types/:id')
  editType(@Actor() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.clinic.configuration.visitType(user, body, id);
  }
  @Delete('visit-types/:id')
  deleteType(@Actor() user: User, @Param('id') id: string) {
    return this.clinic.configuration.deleteVisitType(user, id);
  }
  @Post('time-blocks')
  block(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.configuration.timeBlock(user, body);
  }
  @Delete('time-blocks/:id')
  deleteBlock(@Actor() user: User, @Param('id') id: string) {
    return this.clinic.configuration.deleteTimeBlock(user, id);
  }
}
