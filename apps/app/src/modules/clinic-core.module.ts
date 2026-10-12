import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { SessionGuard } from '../auth/session.guard';

@Global()
@Module({})
export class ClinicCoreModule implements OnApplicationShutdown {
  constructor(@Inject(CLINIC) private readonly clinic: Clinic) {}

  /** Shutdown hooks close the SQLite connection after in-flight requests finish. */
  onApplicationShutdown() {
    return this.clinic.db.close();
  }

  static register(clinic: Clinic): DynamicModule {
    return {
      module: ClinicCoreModule,
      providers: [{ provide: CLINIC, useValue: clinic }, SessionGuard],
      exports: [CLINIC, SessionGuard],
    };
  }
}
