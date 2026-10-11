import type { Pet, PlanInput, Product, VisitType } from '@vet-clinic/types';
export interface DraftContext {
  pet: Pet;
  symptoms: string;
  visitTypes: VisitType[];
  products: Product[];
}
export interface PlanningPort {
  readonly available: boolean;
  draft(context: DraftContext): Promise<PlanInput>;
}
