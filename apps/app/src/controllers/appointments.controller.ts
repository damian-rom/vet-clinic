import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class AppointmentsController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Post('appointments')
  book(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.appointments.book(user, body);
  }
  @Post('appointments/:id/:action')
  appointment(
    @Actor() user: User,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    return this.clinic.appointments.appointment(user, id, action, body);
  }
  @Post('ai/draft')
  draft(@Actor() user: User, @Body() body: unknown) {
    return this.clinic.planning.draft(user, body);
  }
}
