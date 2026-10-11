import { Module, type DynamicModule } from '@nestjs/common';
import { Clinic } from './clinic';
import { ClinicCoreModule } from './modules/clinic-core.module';
import { AuthModule } from './modules/auth.module';
import { WorkspaceModule } from './modules/workspace.module';
import { PetsModule } from './modules/pets.module';
import { AppointmentsModule } from './modules/appointments.module';
import { CasesModule } from './modules/cases.module';
import { InventoryModule } from './modules/inventory.module';
import { ConfigurationModule } from './modules/configuration.module';
import { ReportsModule } from './modules/reports.module';

@Module({})
export class AppModule {
  static register(clinic: Clinic): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ClinicCoreModule.register(clinic),
        AuthModule,
        WorkspaceModule,
        PetsModule,
        AppointmentsModule,
        CasesModule,
        InventoryModule,
        ConfigurationModule,
        ReportsModule,
      ],
    };
  }
}
