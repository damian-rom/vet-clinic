import type {
  Appointment,
  Case,
  Pet,
  Product,
  StockMovement,
  TimeBlock,
  User,
  VisitType,
} from '@vet-clinic/types';

export interface Account extends User {
  passwordHash: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}

export interface State {
  users: Account[];
  sessions: Session[];
  pets: Pet[];
  appointments: Appointment[];
  cases: Case[];
  products: Product[];
  movements: StockMovement[];
  visitTypes: VisitType[];
  timeBlocks: TimeBlock[];
}

export const collections = [
  'users',
  'sessions',
  'pets',
  'appointments',
  'cases',
  'products',
  'movements',
  'visitTypes',
  'timeBlocks',
] as const satisfies readonly (keyof State)[];
