/** Manager ledger writes: meal grid saves and manager-recorded payments. */
import { addDoc, deleteDoc, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { mealDocId, messCol, messDoc } from './paths';
import { mealCountOf, type MealType } from './mealTypes';
import type { PaymentPurpose } from '../hooks/useMonthEntries';

export const LEDGER_BATCH_SIZE = 50;

export interface MealCell {
  uid: string;
  date: string;
  meals: Record<string, number>;
}

export type MealWrite = { kind: 'set'; id: string; uid: string; date: string; meals: Record<string, number>; meal_count: number } | { kind: 'delete'; id: string };

/**
 * Turns edited cells into writes. A day whose weighted total is 0 is deleted
 * (if it exists) rather than stored as an empty map. Pure, unit-tested.
 */
export function planMealWrites(cells: MealCell[], existingIds: Set<string>, types: Pick<MealType, 'id' | 'weight'>[]): MealWrite[] {
  const writes: MealWrite[] = [];
  for (const cell of cells) {
    const id = mealDocId(cell.uid, cell.date);
    const meals: Record<string, number> = {};
    for (const [typeId, raw] of Object.entries(cell.meals)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) meals[typeId] = n;
    }
    const total = mealCountOf(meals, types);
    if (total <= 0) {
      if (existingIds.has(id)) writes.push({ kind: 'delete', id });
      continue;
    }
    writes.push({ kind: 'set', id, uid: cell.uid, date: cell.date, meals, meal_count: total });
  }
  return writes;
}

/** Applies planned writes in small sequential batches (rules read a few docs per write). */
export async function saveMealCells(db: Firestore, messId: string, writes: MealWrite[], onProgress?: (done: number, total: number) => void): Promise<void> {
  for (let i = 0; i < writes.length; i += LEDGER_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const write of writes.slice(i, i + LEDGER_BATCH_SIZE)) {
      const ref = messDoc(db, messId, 'daily_meals', write.id);
      if (write.kind === 'delete') batch.delete(ref);
      else batch.set(ref, { date: write.date, user_id: write.uid, meals: write.meals, meal_count: write.meal_count, updated_at: serverTimestamp(), timestamp: serverTimestamp() });
    }
    await batch.commit();
    onProgress?.(Math.min(i + LEDGER_BATCH_SIZE, writes.length), writes.length);
  }
}

/** Writes one member's day without merge so removed meal types do not linger. Deletes the doc when empty. */
export async function upsertMealDay(db: Firestore, messId: string, uid: string, date: string, meals: Record<string, number>, types: Pick<MealType, 'id' | 'weight'>[]): Promise<void> {
  const [write] = planMealWrites([{ uid, date, meals }], new Set([mealDocId(uid, date)]), types);
  if (!write) return;
  const ref = messDoc(db, messId, 'daily_meals', write.id);
  if (write.kind === 'delete') await deleteDoc(ref);
  else await setDoc(ref, { date: write.date, user_id: write.uid, meals: write.meals, meal_count: write.meal_count, updated_at: serverTimestamp(), timestamp: serverTimestamp() });
}

export interface ManagerPaymentInput {
  user_id: string;
  amount: number;
  purpose: PaymentPurpose;
  date: string;
  note?: string;
}

/** A payment entered by the manager is confirmed immediately. */
export async function recordManagerPayment(db: Firestore, messId: string, managerUid: string, input: ManagerPaymentInput): Promise<void> {
  await addDoc(messCol(db, messId, 'payments'), {
    date: input.date,
    user_id: input.user_id,
    amount: input.amount,
    purpose: input.purpose,
    status: 'confirmed',
    note: (input.note || '').trim(),
    recorded_by: managerUid,
    confirmed_by: managerUid,
    confirmed_at: serverTimestamp(),
    timestamp: serverTimestamp(),
  });
}
