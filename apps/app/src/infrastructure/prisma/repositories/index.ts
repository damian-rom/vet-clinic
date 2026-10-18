import type { Database, Tx } from '@vet-clinic/db';
import { AppointmentsRepository } from './appointments.repository';
import { CasesRepository } from './cases.repository';
import { MovementsRepository } from './movements.repository';
import { PetsRepository } from './pets.repository';
import { ProductsRepository } from './products.repository';
import { SessionsRepository } from './sessions.repository';
import { TimeBlocksRepository } from './time-blocks.repository';
import { UsersRepository } from './users.repository';
import { VisitTypesRepository } from './visit-types.repository';

/** Every repository, bound to one transaction. */
export class Repositories {
  readonly users: UsersRepository;
  readonly sessions: SessionsRepository;
  readonly pets: PetsRepository;
  readonly cases: CasesRepository;
  readonly appointments: AppointmentsRepository;
  readonly products: ProductsRepository;
  readonly movements: MovementsRepository;
  readonly visitTypes: VisitTypesRepository;
  readonly timeBlocks: TimeBlocksRepository;
  constructor(tx: Tx) {
    this.users = new UsersRepository(tx);
    this.sessions = new SessionsRepository(tx);
    this.pets = new PetsRepository(tx);
    this.cases = new CasesRepository(tx);
    this.appointments = new AppointmentsRepository(tx);
    this.products = new ProductsRepository(tx);
    this.movements = new MovementsRepository(tx);
    this.visitTypes = new VisitTypesRepository(tx);
    this.timeBlocks = new TimeBlocksRepository(tx);
  }
}

/**
 * The services' entry point to persistence: each `read` or `write` is one transaction, and
 * the callback receives repositories bound to it.
 */
export class Store {
  constructor(readonly db: Database) {}
  /** A consistent snapshot across related tables. */
  read<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.read((tx) => fn(new Repositories(tx)));
  }
  /** Checks and writes that commit together, or not at all. */
  write<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.write((tx) => fn(new Repositories(tx)));
  }
}

export type { AppointmentChanges, ScheduledVisit } from './appointments.repository';
