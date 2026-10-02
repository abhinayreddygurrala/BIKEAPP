import type { JSONSchema } from 'expo-foundation-models';

import { distanceUnitLabel, formatDistance, type Units } from '@/features/ride-tracking/rideMath';
import type { Expense } from '@/services/expenseService';
import type { FuelLog } from '@/services/fuelService';
import type { MaintenanceRecord } from '@/services/maintenanceService';
import type { MaintenanceType } from '@/features/maintenance/maintenanceLocalDb';

const KM_TO_MI = 0.621371;
const LITERS_PER_GALLON = 3.78541;

// The one place every maintenance type's display label is defined — screens
// import this instead of keeping their own copy, so adding a type (like
// valve_adjustment) only means updating it here.
export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  oil_change: 'Oil Change',
  chain: 'Chain',
  tires: 'Tires',
  brake_pads: 'Brake Pads',
  valve_adjustment: 'Valve Adjustment',
  service: 'Service',
  mod: 'Modification',
  other: 'Other',
};

export const EXPENSE_CATEGORY_LABELS: Record<Expense['category'], string> = {
  insurance: 'Insurance',
  registration: 'Registration',
  accessory: 'Accessory',
  loan_payment: 'Loan Payment',
  other: 'Other',
};

export type ExpenseFieldConfig = {
  showProvider: boolean;
  providerLabel: string;
  providerPlaceholder: string;
  showReference: boolean;
  referenceLabel: string;
  referencePlaceholder: string;
  showPeriodStart: boolean;
  showPeriodEnd: boolean;
  periodEndLabel: string;
};

// What a category actually needs — an insurance card and a registration slip
// carry real fields a generic "expense" doesn't (who issued it, a policy or
// plate number, when it lapses); an accessory or loan payment doesn't need
// any of that. Screens read this instead of branching per-category inline.
export const EXPENSE_CATEGORY_FIELDS: Record<Expense['category'], ExpenseFieldConfig> = {
  insurance: {
    showProvider: true,
    providerLabel: 'Insurance Company',
    providerPlaceholder: 'e.g. Progressive',
    showReference: true,
    referenceLabel: 'Policy Number',
    referencePlaceholder: 'e.g. ABC123456',
    showPeriodStart: true,
    showPeriodEnd: true,
    periodEndLabel: 'Coverage Ends',
  },
  registration: {
    showProvider: true,
    providerLabel: 'Issuing Authority',
    providerPlaceholder: 'e.g. State DMV',
    showReference: true,
    referenceLabel: 'Registration / Plate Number',
    referencePlaceholder: 'e.g. 7ABC123',
    showPeriodStart: false,
    showPeriodEnd: true,
    periodEndLabel: 'Expires On',
  },
  loan_payment: {
    showProvider: true,
    providerLabel: 'Lender',
    providerPlaceholder: 'e.g. Honda Financial',
    showReference: true,
    referenceLabel: 'Account Number',
    referencePlaceholder: 'Optional',
    showPeriodStart: false,
    showPeriodEnd: false,
    periodEndLabel: '',
  },
  accessory: {
    showProvider: false,
    providerLabel: '',
    providerPlaceholder: '',
    showReference: false,
    referenceLabel: '',
    referencePlaceholder: '',
    showPeriodStart: false,
    showPeriodEnd: false,
    periodEndLabel: '',
  },
  other: {
    showProvider: false,
    providerLabel: '',
    providerPlaceholder: '',
    showReference: false,
    referenceLabel: '',
    referencePlaceholder: '',
    showPeriodStart: false,
    showPeriodEnd: false,
    periodEndLabel: '',
  },
};

export type MaintenanceScanResult = {
  type?: string;
  odometer?: number;
  cost?: number;
  notes?: string;
};

/** A JSON schema for on-device vision extraction from a service receipt or
 * invoice (see receiptScanService.ts). `type` is constrained to the app's
 * own maintenance types so a match can be applied directly to the Type
 * picker without a separate label-matching step. */
export function buildMaintenanceScanSchema(): JSONSchema {
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: Object.keys(MAINTENANCE_TYPE_LABELS),
        description: 'Which kind of service this receipt or invoice is for',
      },
      odometer: { type: 'number', description: 'The odometer/mileage reading shown on the document, numeric only' },
      cost: { type: 'number', description: 'The total amount charged, in dollars, numeric only' },
      notes: { type: 'string', description: 'A short one-line summary of the work performed' },
    },
  };
}

export type ExpenseScanResult = {
  provider?: string;
  referenceNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  description?: string;
  amount?: number;
};

/** A JSON schema for on-device vision extraction (see receiptScanService.ts),
 * shaped to match exactly the fields EXPENSE_CATEGORY_FIELDS shows for this
 * category — scanning an accessory receipt won't ask the model for a policy
 * number it was never going to show a field for. */
export function buildExpenseScanSchema(category: Expense['category']): JSONSchema {
  const fields = EXPENSE_CATEGORY_FIELDS[category];
  const properties: Record<string, JSONSchema> = {
    amount: { type: 'number', description: 'The total amount charged, in dollars, numeric only, no currency symbol' },
    description: { type: 'string', description: 'A short one-line description of what this expense is for' },
  };
  if (fields.showProvider) {
    properties.provider = { type: 'string', description: fields.providerLabel };
  }
  if (fields.showReference) {
    properties.referenceNumber = { type: 'string', description: fields.referenceLabel };
  }
  if (fields.showPeriodStart) {
    properties.periodStart = { type: 'string', description: 'The coverage/validity start date, as YYYY-MM-DD' };
  }
  if (fields.showPeriodEnd) {
    properties.periodEnd = {
      type: 'string',
      description: `The ${fields.periodEndLabel.toLowerCase() || 'end'} date, as YYYY-MM-DD`,
    };
  }
  return { type: 'object', properties };
}

/** Parses a free-text "YYYY-MM-DD"-ish date field (used for expense coverage
 * periods and maintenance due dates) into ISO for storage. An empty string is
 * valid — it means "not set", distinct from text that doesn't parse. */
export function parseOptionalDateInput(text: string): { ok: true; iso: string | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, iso: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { ok: false };
  return { ok: true, iso: parsed.toISOString() };
}

export type MaintenanceStats = {
  totalServiceCost: number;
  totalFuelCost: number;
  totalExpenseCost: number;
  totalSpent: number;
  /** Derived from the spread between the lowest and highest logged odometer reading — null until there are at least two. */
  distanceCoveredKm: number | null;
  costPerKm: number | null;
  /** Full-tank-to-full-tank economy: distance covered on a tank divided by the liters that refilled it. */
  fuelEconomyKmPerLiter: number | null;
};

export function computeMaintenanceStats(
  records: MaintenanceRecord[],
  fuelLogs: FuelLog[],
  expenses: Expense[] = []
): MaintenanceStats {
  const totalServiceCost = records.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const totalFuelCost = fuelLogs.reduce((sum, f) => sum + (f.cost ?? 0), 0);
  const totalExpenseCost = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const totalSpent = totalServiceCost + totalFuelCost + totalExpenseCost;

  const odometerReadings = [...records.map((r) => r.odometer_km), ...fuelLogs.map((f) => f.odometer_km)].filter(
    (v): v is number => v != null
  );
  const distanceCoveredKm =
    odometerReadings.length >= 2 ? Math.max(...odometerReadings) - Math.min(...odometerReadings) : null;
  const costPerKm = distanceCoveredKm && distanceCoveredKm > 0 ? totalSpent / distanceCoveredKm : null;

  const economyFills = fuelLogs.filter((f) => f.full_tank && f.distance_since_last_full_km != null && f.liters != null);
  const economyDistanceKm = economyFills.reduce((sum, f) => sum + (f.distance_since_last_full_km ?? 0), 0);
  const economyLiters = economyFills.reduce((sum, f) => sum + (f.liters ?? 0), 0);
  const fuelEconomyKmPerLiter = economyLiters > 0 ? economyDistanceKm / economyLiters : null;

  return {
    totalServiceCost,
    totalFuelCost,
    totalExpenseCost,
    totalSpent,
    distanceCoveredKm,
    costPerKm,
    fuelEconomyKmPerLiter,
  };
}

export function formatCostPerDistance(costPerKm: number | null, units: Units): string | null {
  if (costPerKm == null) return null;
  const perDisplayUnit = units === 'imperial' ? costPerKm / KM_TO_MI : costPerKm;
  return `$${perDisplayUnit.toFixed(2)}`;
}

export function formatFuelEconomy(kmPerLiter: number | null, units: Units): { value: string; unit: string } | null {
  if (kmPerLiter == null) return null;
  if (units === 'imperial') {
    return { value: (kmPerLiter * KM_TO_MI * LITERS_PER_GALLON).toFixed(1), unit: 'mpg' };
  }
  return { value: kmPerLiter.toFixed(1), unit: 'km/L' };
}

// Fuel volume is stored in liters (same "canonical metric unit" convention
// rideMath.ts uses for distance/speed) and only converted at the
// input/display boundary.
export function volumeUnitLabel(units: Units): string {
  return units === 'imperial' ? 'gal' : 'L';
}

export function litersToDisplayValue(liters: number, units: Units): number {
  return units === 'imperial' ? liters / LITERS_PER_GALLON : liters;
}

export function displayValueToLiters(value: number, units: Units): number {
  return units === 'imperial' ? value * LITERS_PER_GALLON : value;
}

export function formatVolume(liters: number | null, units: Units): string {
  if (liters == null) return '';
  return litersToDisplayValue(liters, units).toFixed(2);
}

export type DueStatus = 'overdue' | 'soon' | 'upcoming';

export type DueItem = {
  record: MaintenanceRecord;
  status: DueStatus;
  odometerRemainingKm: number | null;
  daysRemaining: number | null;
};

export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  overdue: 'Overdue',
  soon: 'Due Soon',
  upcoming: 'Upcoming',
};

/** "300 mi away · due 11/2/2026" — the one-line "how close is it" for a due item. */
export function describeDue(item: DueItem, units: Units): string {
  const parts: string[] = [];
  if (item.odometerRemainingKm != null) {
    const dist = formatDistance(Math.abs(item.odometerRemainingKm) * 1000, units);
    const unit = distanceUnitLabel(units);
    parts.push(item.odometerRemainingKm <= 0 ? `${dist} ${unit} overdue` : `${dist} ${unit} away`);
  }
  if (item.record.next_due_date) {
    const dateLabel = new Date(item.record.next_due_date).toLocaleDateString();
    parts.push(item.daysRemaining != null && item.daysRemaining <= 0 ? `was due ${dateLabel}` : `due ${dateLabel}`);
  }
  return parts.join(' · ');
}

/**
 * Best guess at the bike's odometer right now: the highest reading anywhere —
 * the bike's own field, or any service/fuel log — since whichever was logged
 * most recently is also the largest.
 */
export function getCurrentOdometerKm(
  bikeOdometerKm: number | null,
  records: MaintenanceRecord[],
  fuelLogs: FuelLog[]
): number | null {
  const readings = [bikeOdometerKm, ...records.map((r) => r.odometer_km), ...fuelLogs.map((f) => f.odometer_km)].filter(
    (v): v is number => v != null
  );
  return readings.length ? Math.max(...readings) : null;
}

const DUE_SOON_KM = 500;
const DUE_SOON_DAYS = 30;

function statusFor(odometerRemainingKm: number | null, daysRemaining: number | null): DueStatus {
  const remainders = [odometerRemainingKm, daysRemaining].filter((v): v is number => v != null);
  if (remainders.some((v) => v <= 0)) return 'overdue';
  if (
    (odometerRemainingKm != null && odometerRemainingKm <= DUE_SOON_KM) ||
    (daysRemaining != null && daysRemaining <= DUE_SOON_DAYS)
  ) {
    return 'soon';
  }
  return 'upcoming';
}

const STATUS_RANK: Record<DueStatus, number> = { overdue: 0, soon: 1, upcoming: 2 };

/** Every service record with a "next due" set, annotated with how close it is — most urgent first. */
export function getDueItems(records: MaintenanceRecord[], currentOdometerKm: number | null): DueItem[] {
  const now = Date.now();
  return records
    .filter((r) => r.next_due_odometer_km != null || r.next_due_date != null)
    .map((record) => {
      const odometerRemainingKm =
        record.next_due_odometer_km != null && currentOdometerKm != null
          ? record.next_due_odometer_km - currentOdometerKm
          : null;
      const daysRemaining =
        record.next_due_date != null ? Math.ceil((new Date(record.next_due_date).getTime() - now) / 86_400_000) : null;
      return { record, status: statusFor(odometerRemainingKm, daysRemaining), odometerRemainingKm, daysRemaining };
    })
    .sort((a, b) => {
      if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      const aRemaining = a.daysRemaining ?? a.odometerRemainingKm ?? Infinity;
      const bRemaining = b.daysRemaining ?? b.odometerRemainingKm ?? Infinity;
      return aRemaining - bRemaining;
    });
}

// Generic rule-of-thumb intervals for the routine service types — not
// specific to any make/model, just enough that a brand-new bike with zero
// service history isn't sitting at zero reminders. Deliberately limited to
// the types where a generic number is still useful; "service"/"mod"/"other"
// are too open-ended to default.
const DEFAULT_INTERVAL_KM: Partial<Record<MaintenanceType, number>> = {
  oil_change: 5000,
  chain: 20000,
  tires: 10000,
  brake_pads: 20000,
  valve_adjustment: 20000,
};

export type SuggestedInterval = {
  type: MaintenanceType;
  intervalKm: number;
  suggestedAtKm: number;
};

/**
 * For each default-interval type that has NEVER been logged for this bike
 * (any history at all, regardless of how close its real next-due is), suggest
 * a first check-in point measured from the current odometer. Purely a
 * computed nudge — nothing is written to the database, and it disappears the
 * moment the rider actually logs that type of service.
 */
export function getSuggestedIntervals(
  records: MaintenanceRecord[],
  currentOdometerKm: number | null
): SuggestedInterval[] {
  if (currentOdometerKm == null) return [];
  const loggedTypes = new Set(records.map((r) => r.type));
  return (Object.entries(DEFAULT_INTERVAL_KM) as [MaintenanceType, number][])
    .filter(([type]) => !loggedTypes.has(type))
    .map(([type, intervalKm]) => ({ type, intervalKm, suggestedAtKm: currentOdometerKm + intervalKm }));
}
