import { collection, query } from 'firebase/firestore';
import { db } from '../firebase';
import { MEAL_TYPES_COLLECTION, type MealType } from '../lib/mealTypes';
import { sortCategories } from '../lib/costCategories';
import { useCollection } from './useCollection';

export function useMealTypes(): { mealTypes: MealType[]; activeMealTypes: MealType[]; loading: boolean } {
  const { docs, loading } = useCollection<Omit<MealType, 'id'>>(() => query(collection(db, MEAL_TYPES_COLLECTION)), 'meal_types');
  const mealTypes = sortCategories(docs.map((d) => ({ id: d.id, ...d.data })));
  return { mealTypes, activeMealTypes: mealTypes.filter((t) => t.active), loading };
}
