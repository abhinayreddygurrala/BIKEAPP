import { uuidv4 } from '@/lib/uuid';
import {
  createLocalExpense,
  deleteLocalExpense,
  getLocalExpense,
  listLocalExpenses,
  updateLocalExpense,
  type ExpenseCategory,
  type LocalExpense,
} from '@/features/maintenance/expensesLocalDb';

export type { ExpenseCategory };
export type Expense = LocalExpense;

export async function listExpenses(bikeId: string): Promise<Expense[]> {
  return listLocalExpenses(bikeId);
}

export async function getExpense(id: string): Promise<Expense | null> {
  return getLocalExpense(id);
}

export async function createExpense(input: {
  bike_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  incurred_at: string;
  notes: string | null;
}): Promise<Expense> {
  const id = uuidv4();
  await createLocalExpense(id, input);
  const row = await getLocalExpense(id);
  if (!row) throw new Error('Failed to create expense');
  return row;
}

export async function updateExpense(
  id: string,
  updates: Partial<Pick<Expense, 'category' | 'description' | 'amount' | 'incurred_at' | 'notes'>>
): Promise<void> {
  await updateLocalExpense(id, updates);
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteLocalExpense(id);
}
