import { collection, doc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';

export interface MealType {
  id: string;
  label_bn: string;
  label_en: string;
  /** How much of a "full meal" one unit of this type counts as. Breakfast might be 0.5. */
  weight: number;
  sort_order: number;
  active: boolean;
}

export const MEAL_TYPES_COLLECTION = 'meal_types';

export const DEFAULT_MEAL_TYPES: MealType[] = [
  { id: 'lunch', label_bn: 'দুপুর', label_en: 'Lunch', weight: 1, sort_order: 10, active: true },
  { id: 'dinner', label_bn: 'রাত', label_en: 'Dinner', weight: 1, sort_order: 20, active: true },
  { id: 'others', label_bn: 'অন্যান্য', label_en: 'Others', weight: 1, sort_order: 30, active: true },
];

export async function seedMealTypesIfEmpty(db: Firestore): Promise<boolean> {
  const existing = await getDocs(collection(db, MEAL_TYPES_COLLECTION));
  if (!existing.empty) return false;
  const batch = writeBatch(db);
  for (const type of DEFAULT_MEAL_TYPES) {
    const { id, ...data } = type;
    batch.set(doc(db, MEAL_TYPES_COLLECTION, id), data);
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
