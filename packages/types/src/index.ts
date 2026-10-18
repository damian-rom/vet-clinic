export type Role = 'owner' | 'vet';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export type Species = 'Dog' | 'Cat' | 'Rabbit' | 'Bird' | 'Other';
export type Sex = 'Male' | 'Female';
export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: Species;
  sex: Sex;
  dateOfBirth?: string;
  approximateAge?: string;
  breed?: string;
  weight?: number;
  notes?: string;
}
export type AppointmentStatus =
  'AwaitingConfirmation' | 'Confirmed' | 'NeedsTime' | 'Done' | 'Cancelled';
export type PlanSource = 'human' | 'ai-draft' | 'ai-reviewed';
export interface EstimatedActive {
  productId: string;
  quantity: number;
}
export interface PlanInput {
  visitTypeId: string;
  durationMinutes: number;
  estimatedActives: EstimatedActive[];
}
export interface VisitPlan extends PlanInput {
  source: PlanSource;
  reviewedBy?: string;
  savedAt: string;
  originalDraft?: PlanInput;
}
export interface Appointment {
  id: string;
  petId: string;
  ownerId: string;
  vetId?: string;
  scheduledAt?: string;
  symptoms: string;
  status: AppointmentStatus;
  caseId?: string;
  checkpointOrder?: number;
  petNeeded?: boolean;
  plan?: VisitPlan;
  actualActives?: EstimatedActive[];
  createdAt: string;
  completedAt?: string;
  revision: number;
}
export type OwnerAppointment = Omit<Appointment, 'plan' | 'actualActives' | 'revision'>;
export interface VisitType {
  id: string;
  name: string;
  retired: boolean;
}
export interface Case {
  id: string;
  petId: string;
  name: string;
  checkpointIds: string[];
  createdAt: string;
}
export interface Product {
  id: string;
  name: string;
  unit: string;
  stock: number;
}
export type MovementType = 'Received' | 'Correction' | 'Used';
export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  reason?: string;
  performedBy: string;
  performedAt: string;
  appointmentId?: string;
}
export interface TimeBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}
export interface ClinicSettings {
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  openDays: readonly number[];
  timezone: string;
}
export interface OwnerWorkspace {
  user: User;
  pets: Pet[];
  appointments: OwnerAppointment[];
  cases: Case[];
  vets: Pick<User, 'id' | 'name'>[];
  clinic: ClinicSettings;
}
export interface VetWorkspace {
  user: User;
  pets: Pet[];
  /** Open visits, case checkpoints, and visits closed on or after `historySince`. */
  appointments: Appointment[];
  /** Older closed visits are paged in through `appointments/history?before=historySince`. */
  historySince: string;
  cases: Case[];
  vets: User[];
  owners: User[];
  products: (Product & { needed: number })[];
  movements: StockMovement[];
  visitTypes: VisitType[];
  timeBlocks: TimeBlock[];
  clinic: ClinicSettings;
  aiAvailable: boolean;
  metrics: {
    plannedBeforeVisitPercent: number;
    aiKeptWithMinorEditsPercent: number;
    completedVisits: number;
  };
}
/** One page of closed visits older than the vet workspace window, newest first. */
export interface AppointmentHistoryPage {
  appointments: Appointment[];
  /** Pass back as `cursor` for the next page; null when there is nothing older. */
  next: string | null;
}
