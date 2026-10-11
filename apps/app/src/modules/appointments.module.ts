import { Module } from '@nestjs/common';
import { AppointmentsController } from '../controllers/appointments.controller';

@Module({ controllers: [AppointmentsController] })
export class AppointmentsModule {}
