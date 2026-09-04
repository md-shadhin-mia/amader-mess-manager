import { collection, doc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, type CostCategory } from './defaults';

export { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, ROOM_RENT_CATEGORY_ID } from './defaults';
export type { CostCategory, CostTiming, SplitRule } from './defaults';

/** Browser-side one-time seed, run by the first manager to open the dashboard. */
export async function seedCostCategoriesIfEmpty(db: Firestore): Promise<boolean> {
  const existing = await getDocs(collection(db, COST_CATEGORIES_COLLECTION));
  if (!existing.empty) return false;
  const batch = writeBatch(db);
  for (const category of DEFAULT_COST_CATEGORIES) {
    const { id, ...data } = category;
    batch.set(doc(db, COST_CATEGORIES_COLLECTION, id), data);
  }
  await batch.commit();
  return true;
}

export function sortCategories<T extends { sort_order: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function isSharedAmountCategory(category: CostCategory): boolean {
  return category.split_rule === 'equal' || category.split_rule === 'by_meals';
}
