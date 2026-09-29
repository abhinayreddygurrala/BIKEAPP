import { getDb } from '@/lib/localDb';

export type ExpenseCategory = 'insurance' | 'registration' | 'accessory' | 'loan_payment' | 'other';

export type LocalExpense = {
  id: string;
  bike_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  incurred_at: string;
  notes: string | null;
  created_at: string;
};

export async function createLocalExpense(id: string, expense: Omit<LocalExpense, 'id' | 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO expenses_local (id, bike_id, category, description, amount, incurred_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      expense.bike_id,
      expense.category,
      expense.description,
      expense.amount,
      expense.incurred_at,
      expense.notes,
      new Date().toISOString(),
    ]
  );
}

export async function updateLocalExpense(
  id: string,
  updates: Partial<Omit<LocalExpense, 'id' | 'bike_id' | 'created_at'>>
): Promise<void> {
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE expenses_local SET ${setClause} WHERE id = ?`, [
    ...keys.map((k) => updates[k] as string | number | null),
    id,
  ]);
}

export async function deleteLocalExpense(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM expenses_local WHERE id = ?`, [id]);
}

export async function listLocalExpenses(bikeId: string): Promise<LocalExpense[]> {
  const db = await getDb();
  return db.getAllAsync<LocalExpense>(`SELECT * FROM expenses_local WHERE bike_id = ? ORDER BY incurred_at DESC`, [
    bikeId,
  ]);
}

export async function getLocalExpense(id: string): Promise<LocalExpense | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalExpense>(`SELECT * FROM expenses_local WHERE id = ?`, [id]);
  return row ?? null;
}
