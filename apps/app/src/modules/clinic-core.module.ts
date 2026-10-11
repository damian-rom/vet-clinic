import { Global, Module, type DynamicModule } from '@nestjs/common';
import { Clinic } from '../clinic';
import { CLINIC } from '../http';
import { SessionGuard } from '../auth/session.guard';

@Global()
@Module({})
export class ClinicCoreModule {
  static register(clinic: Clinic): DynamicModule {
    return {
      module: ClinicCoreModule,
      providers: [{ provide: CLINIC, useValue: clinic }, SessionGuard],
      exports: [CLINIC, SessionGuard],
    };
  }
}
