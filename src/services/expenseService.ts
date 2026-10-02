import { deleteAttachment, getAttachmentUri, saveAttachment, type AttachmentKind } from '@/lib/localAttachmentStorage';
import { uuidv4 } from '@/lib/uuid';
import {
  addLocalExpenseAttachment,
  createLocalExpense,
  deleteLocalExpense,
  deleteLocalExpenseAttachment,
  deleteLocalExpenseAttachmentsForExpense,
  getLocalExpense,
  listLocalExpenseAttachments,
  listLocalExpenses,
  updateLocalExpense,
  type ExpenseCategory,
  type LocalExpense,
} from '@/features/maintenance/expensesLocalDb';

export type { ExpenseCategory, AttachmentKind };

export type ExpenseAttachment = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  uri: string;
};

export type Expense = LocalExpense & { attachments: ExpenseAttachment[] };

async function withAttachments(expense: LocalExpense): Promise<Expense> {
  const rows = await listLocalExpenseAttachments(expense.id);
  return {
    ...expense,
    attachments: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      uri: getAttachmentUri(row.filename),
    })),
  };
}

export async function listExpenses(bikeId: string): Promise<Expense[]> {
  const rows = await listLocalExpenses(bikeId);
  return Promise.all(rows.map(withAttachments));
}

export async function getExpense(id: string): Promise<Expense | null> {
  const row = await getLocalExpense(id);
  return row ? withAttachments(row) : null;
}

export async function createExpense(input: {
  bike_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  incurred_at: string;
  notes: string | null;
  reference_number?: string | null;
  provider?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  attachments?: { uri: string; kind: AttachmentKind }[];
}): Promise<Expense> {
  const id = uuidv4();
  await createLocalExpense(id, {
    bike_id: input.bike_id,
    category: input.category,
    description: input.description,
    amount: input.amount,
    incurred_at: input.incurred_at,
    notes: input.notes,
    reference_number: input.reference_number ?? null,
    provider: input.provider ?? null,
    period_start: input.period_start ?? null,
    period_end: input.period_end ?? null,
  });

  for (const attachment of input.attachments ?? []) {
    await addExpenseAttachment(id, attachment.uri, attachment.kind);
  }

  const row = await getLocalExpense(id);
  if (!row) throw new Error('Failed to create expense');
  return withAttachments(row);
}

export async function updateExpense(
  id: string,
  updates: Partial<
    Pick<
      Expense,
      'category' | 'description' | 'amount' | 'incurred_at' | 'notes' | 'reference_number' | 'provider' | 'period_start' | 'period_end'
    >
  >
): Promise<void> {
  await updateLocalExpense(id, updates);
}

/** Copies a newly-picked file into permanent storage and attaches it to an existing expense. */
export async function addExpenseAttachment(
  expenseId: string,
  sourceUri: string,
  kind: AttachmentKind
): Promise<ExpenseAttachment> {
  const id = uuidv4();
  const filename = await saveAttachment(id, sourceUri, kind);
  await addLocalExpenseAttachment({ id, expense_id: expenseId, filename, kind, created_at: new Date().toISOString() });
  return { id, kind, filename, uri: getAttachmentUri(filename) };
}

export async function removeExpenseAttachment(attachment: Pick<ExpenseAttachment, 'id' | 'filename'>): Promise<void> {
  deleteAttachment(attachment.filename);
  await deleteLocalExpenseAttachment(attachment.id);
}

export async function deleteExpense(expense: Pick<Expense, 'id' | 'attachments'>): Promise<void> {
  for (const attachment of expense.attachments) {
    deleteAttachment(attachment.filename);
  }
  await deleteLocalExpenseAttachmentsForExpense(expense.id);
  await deleteLocalExpense(expense.id);
}
