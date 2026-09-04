import { query } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { messCol } from '../lib/paths';
import type { MealType } from '../lib/mealTypes';
import { sortCategories } from '../lib/costCategories';
import { useCollection } from './useCollection';

export function useMealTypes(): { mealTypes: MealType[]; activeMealTypes: MealType[]; loading: boolean } {
  const { messId } = useMess();
  const { docs, loading } = useCollection<Omit<MealType, 'id'>>(() => (messId ? query(messCol(db, messId, 'meal_types')) : null), `meal_types:${messId}`);
  const mealTypes = sortCategories(docs.map((d) => ({ id: d.id, ...d.data })));
  return { mealTypes, activeMealTypes: mealTypes.filter((t) => t.active), loading };
}
