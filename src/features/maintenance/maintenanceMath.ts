import type { Units } from '@/features/ride-tracking/rideMath';
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
