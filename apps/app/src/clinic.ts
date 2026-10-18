import type { Database } from '@vet-clinic/db';
import { Store } from './infrastructure/prisma/repositories';
import type { PlanningPort } from './domain/ports/planning.port';
import { CompatibleAiAdapter } from './infrastructure/ai/chat-completions.adapter';
import { AuthService } from './services/auth.service';
import { PetsService } from './services/pets.service';
import { AppointmentsService } from './services/appointments.service';
import { PlanningService } from './services/planning.service';
import { CasesService } from './services/cases.service';
import { InventoryService } from './services/inventory.service';
import { ConfigurationService } from './services/configuration.service';
import { WorkspaceService } from './services/workspace.service';
import { ReportsService } from './services/reports.service';
import type { EmailPort } from './domain/ports/email.port';
import { SmtpEmailAdapter } from './infrastructure/email/smtp.adapter';

/**
 * Composition root. Each feature owns its use cases; the store owns transaction boundaries and
 * hands each one repositories bound to it.
 */
export class Clinic {
  readonly auth: AuthService;
  readonly pets: PetsService;
  readonly appointments: AppointmentsService;
  readonly planning: PlanningService;
  readonly cases: CasesService;
  readonly inventory: InventoryService;
  readonly configuration: ConfigurationService;
  readonly views: WorkspaceService;
  readonly reports: ReportsService;
  constructor(
    readonly db: Database,
    readonly ai: PlanningPort = new CompatibleAiAdapter(),
    readonly now = () => Date.now(),
    timezone = process.env.CLINIC_TIMEZONE || 'America/Havana',
    email: EmailPort = new SmtpEmailAdapter(),
  ) {
    const store = new Store(db);
    this.auth = new AuthService(store, now);
    this.pets = new PetsService(store);
    this.inventory = new InventoryService(store, now);
    this.appointments = new AppointmentsService(store, this.inventory, now, timezone);
    this.planning = new PlanningService(store, ai, this.appointments, now);
    this.cases = new CasesService(store, this.appointments, now);
    this.configuration = new ConfigurationService(store, now);
    this.views = new WorkspaceService(store, ai, now, timezone);
    this.reports = new ReportsService(store, email);
  }
}
