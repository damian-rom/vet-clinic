/** Clinic opening hours and slot configuration */
export const CLINIC_CONFIG = {
  /** Opening hour (24h) */
  openHour: 9,
  /** Closing hour (24h) */
  closeHour: 18,
  /** Slot length in minutes */
  slotMinutes: 30,
  /** Days open: 1=Mon … 5=Fri */
  openDays: [1, 2, 3, 4, 5],
} as const;

/** Default visit types seeded on first run */
export const DEFAULT_VISIT_TYPES = ['Consult', 'Operation', 'Lab work', 'Vaccination'] as const;
