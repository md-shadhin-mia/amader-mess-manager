import { getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { DEFAULT_MEAL_TYPES, MEAL_TYPES_COLLECTION, type MealType } from './defaults';
import { messCol, messDoc } from './paths';

export { DEFAULT_MEAL_TYPES, MEAL_TYPES_COLLECTION } from './defaults';
export type { MealType } from './defaults';

/** Browser-side one-time seed for one mess. Writes only when the collection is empty. */
export async function seedMealTypesIfEmpty(db: Firestore, messId: string): Promise<boolean> {
  const existing = await getDocs(messCol(db, messId, 'meal_types'));
  if (!existing.empty) return false;
  const batch = writeBatch(db);
  for (const type of DEFAULT_MEAL_TYPES) {
    const { id, ...data } = type;
    batch.set(messDoc(db, messId, 'meal_types', id), data);
  }
  await batch.commit();
  return true;
}

/** Weighted total of a per-type meal map. Unknown types count as weight 1. */
export function mealCountOf(meals: Record<string, number> | undefined, types: Pick<MealType, 'id' | 'weight'>[]): number {
  if (!meals) return 0;
  const weights = new Map(types.map((type) => [type.id, Number.isFinite(type.weight) ? type.weight : 1]));
  let total = 0;
  for (const [typeId, count] of Object.entries(meals)) {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n * (weights.get(typeId) ?? 1);
  }
  return Math.round(total * 100) / 100;
}
