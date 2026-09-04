import { collection, query } from 'firebase/firestore';
import { db } from '../firebase';
import { COST_CATEGORIES_COLLECTION, sortCategories, type CostCategory } from '../lib/costCategories';
import { useCollection } from './useCollection';

/** All cost categories (active and inactive), sorted. Consumers filter by `active`. */
export function useCostCategories(): { categories: CostCategory[]; activeCategories: CostCategory[]; loading: boolean } {
  const { docs, loading } = useCollection<Omit<CostCategory, 'id'>>(() => query(collection(db, COST_CATEGORIES_COLLECTION)), 'cost_categories');
  const categories = sortCategories(docs.map((d) => ({ id: d.id, ...d.data })));
  return { categories, activeCategories: categories.filter((c) => c.active), loading };
}
