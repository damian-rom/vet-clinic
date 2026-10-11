import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@Controller()
export class WorkspaceController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Get('health')
  health() {
    return { ok: true };
  }
  @UseGuards(SessionGuard)
  @Get('workspace')
  workspace(@Actor() user: User) {
    return this.clinic.views.workspace(user);
  }
  @UseGuards(SessionGuard)
  @Get('slots')
  slots(
    @Actor() user: User,
    @Query('date') date: string,
    @Query('appointmentId') appointmentId?: string,
  ) {
    return this.clinic.appointments.slots(user, date, appointmentId);
  }
}
