import { getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, type CostCategory } from './defaults';
import { messCol, messDoc } from './paths';

export { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, ROOM_RENT_CATEGORY_ID } from './defaults';
export type { CostCategory, CostTiming, SplitRule } from './defaults';

/** Rules read a few docs per write; keep seed batches small so a batch never nears the limit. */
export const SEED_BATCH_SIZE = 8;

/** Browser-side one-time seed for one mess. Writes only when the collection is empty. */
export async function seedCostCategoriesIfEmpty(db: Firestore, messId: string): Promise<boolean> {
  const existing = await getDocs(messCol(db, messId, 'cost_categories'));
  if (!existing.empty) return false;
  for (let i = 0; i < DEFAULT_COST_CATEGORIES.length; i += SEED_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const category of DEFAULT_COST_CATEGORIES.slice(i, i + SEED_BATCH_SIZE)) {
      const { id, ...data } = category;
      batch.set(messDoc(db, messId, 'cost_categories', id), data);
    }
    await batch.commit();
  }
  return true;
}

export function sortCategories<T extends { sort_order: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function isSharedAmountCategory(category: CostCategory): boolean {
  return category.split_rule === 'equal' || category.split_rule === 'by_meals';
}
