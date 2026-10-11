import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { Actor, SessionGuard } from '../auth/session.guard';
import type { User } from '@vet-clinic/types';
import { UseGuards } from '@nestjs/common';
@UseGuards(SessionGuard)
@Controller()
export class ReportsController {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}
  @Get('reports/:kind')
  async report(
    @Actor() user: User,
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @Res() response: Response,
  ) {
    const { format, ...filters } = query;
    if (format && format !== 'pdf') throw new HttpException('Unknown report format', 400);
    const report = this.clinic.reports.build(user, kind, filters);
    if (format === 'pdf') {
      const pdf = await this.clinic.reports.pdf(report);
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="${report.kind}.pdf"`);
      response.send(pdf);
    } else response.json(report);
  }
  @Post('reports/:kind/email')
  emailReport(@Actor() user: User, @Param('kind') kind: string, @Body() body: unknown) {
    return this.clinic.reports.emailReport(user, kind, body);
  }
}
