import { getDb } from '@/lib/localDb';
import type { AttachmentKind } from '@/lib/localAttachmentStorage';

export type ExpenseCategory = 'insurance' | 'registration' | 'accessory' | 'loan_payment' | 'other';

export type LocalExpense = {
  id: string;
  bike_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  incurred_at: string;
  notes: string | null;
  // Insurance: policy number. Registration: plate/registration number.
  // Loan payment: loan/account number. Unused for accessory/other.
  reference_number: string | null;
  // Insurance: insurer name. Registration: issuing authority (e.g. a state
  // DMV). Loan payment: lender name.
  provider: string | null;
  // Coverage/validity window — e.g. an insurance policy's term, or a
  // registration's valid-from/expires-on dates.
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export type LocalExpenseAttachment = {
  id: string;
  expense_id: string;
  filename: string;
  kind: AttachmentKind;
  created_at: string;
};

export async function createLocalExpense(id: string, expense: Omit<LocalExpense, 'id' | 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO expenses_local
      (id, bike_id, category, description, amount, incurred_at, notes, reference_number, provider, period_start, period_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      expense.bike_id,
      expense.category,
      expense.description,
      expense.amount,
      expense.incurred_at,
      expense.notes,
      expense.reference_number,
      expense.provider,
      expense.period_start,
      expense.period_end,
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

export async function addLocalExpenseAttachment(attachment: LocalExpenseAttachment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO expense_attachments_local (id, expense_id, filename, kind, created_at) VALUES (?, ?, ?, ?, ?)`,
    [attachment.id, attachment.expense_id, attachment.filename, attachment.kind, attachment.created_at]
  );
}

export async function listLocalExpenseAttachments(expenseId: string): Promise<LocalExpenseAttachment[]> {
  const db = await getDb();
  return db.getAllAsync<LocalExpenseAttachment>(
    `SELECT * FROM expense_attachments_local WHERE expense_id = ? ORDER BY created_at ASC`,
    [expenseId]
  );
}

export async function deleteLocalExpenseAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM expense_attachments_local WHERE id = ?`, [id]);
}

export async function deleteLocalExpenseAttachmentsForExpense(expenseId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM expense_attachments_local WHERE expense_id = ?`, [expenseId]);
}
