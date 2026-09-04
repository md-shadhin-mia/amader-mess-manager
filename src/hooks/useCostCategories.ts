import { query } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { messCol } from '../lib/paths';
import { sortCategories, type CostCategory } from '../lib/costCategories';
import { useCollection } from './useCollection';

/** All cost categories of the current mess (active and inactive), sorted. */
export function useCostCategories(): { categories: CostCategory[]; activeCategories: CostCategory[]; loading: boolean } {
  const { messId } = useMess();
  const { docs, loading } = useCollection<Omit<CostCategory, 'id'>>(
    () => (messId ? query(messCol(db, messId, 'cost_categories')) : null),
    `cost_categories:${messId}`,
  );
  const categories = sortCategories(docs.map((d) => ({ id: d.id, ...d.data })));
  return { categories, activeCategories: categories.filter((c) => c.active), loading };
}
