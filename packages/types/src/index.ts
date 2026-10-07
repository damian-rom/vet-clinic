// ── Roles ────────────────────────────────────────────────────────────────────

export type Role = "owner" | "vet";

// ── Pets ─────────────────────────────────────────────────────────────────────

export type Species = "Dog" | "Cat" | "Rabbit" | "Bird" | "Other";
export type Sex = "Male" | "Female";

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: Species;
  sex: Sex;
  dateOfBirth?: string; // ISO date or approximate age string
  breed?: string;
  weight?: number;
  notes?: string;
}

// ── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | "AwaitingConfirmation"
  | "Confirmed"
  | "NeedsTime"
  | "Done"
  | "Cancelled";

export interface Appointment {
  id: string;
  petId: string;
  ownerId: string;
  vetId?: string;
  scheduledAt?: string; // ISO datetime
  symptoms: string;
  status: AppointmentStatus;
  caseId?: string;
  checkpointOrder?: number;
  petNeeded?: boolean;
  plan?: VisitPlan;
}

// ── Visit planning ────────────────────────────────────────────────────────────

export type PlanSource = "human" | "ai-draft" | "ai-reviewed";

export interface EstimatedActive {
  productId: string;
  quantity: number;
}

export interface VisitPlan {
  visitTypeId: string;
  durationMinutes: number;
  estimatedActives: EstimatedActive[];
  source: PlanSource;
  reviewedBy?: string; // vet id
}

// ── Visit types ───────────────────────────────────────────────────────────────

export interface VisitType {
  id: string;
  name: string;
  retired: boolean;
}

// ── Cases ─────────────────────────────────────────────────────────────────────

export interface Case {
  id: string;
  petId: string;
  name: string;
  checkpointIds: string[]; // ordered appointment ids
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  unit: string;
  stock: number;
}

export type MovementType = "Received" | "Correction" | "Used";

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number; // positive = in, negative = out
  reason?: string; // required for Correction
  performedBy: string; // vet id
  performedAt: string; // ISO datetime
  appointmentId?: string; // set when type === "Used"
}

// ── Time blocks ───────────────────────────────────────────────────────────────

export interface TimeBlock {
  id: string;
  startsAt: string; // ISO datetime
  endsAt: string;
  reason?: string;
}
