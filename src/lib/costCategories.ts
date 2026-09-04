import { collection, doc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';

export type SplitRule = 'equal' | 'per_member' | 'by_meals';
export type CostTiming = 'prepaid' | 'postpaid';

export interface CostCategory {
  id: string;
  label_bn: string;
  label_en: string;
  /** equal: ÷ weighted active members; per_member: manager sets each amount; by_meals: ∝ meal count. */
  split_rule: SplitRule;
  /** prepaid: collected at the start of the month; postpaid: settled at month close. */
  timing: CostTiming;
  sort_order: number;
  active: boolean;
  /** room_rent amounts come from users.room_rent and the category cannot be deleted. */
  builtin?: 'room_rent';
}

export const COST_CATEGORIES_COLLECTION = 'cost_categories';
export const ROOM_RENT_CATEGORY_ID = 'room_rent';

/**
 * One-time seed. The eight shared utilities from the requirement plus the
 * built-in per-member room rent. Written only when the collection is empty,
 * so anything the manager changes afterwards is never overwritten.
 */
export const DEFAULT_COST_CATEGORIES: CostCategory[] = [
  { id: 'buya', label_bn: 'বুয়া', label_en: 'Cook / Maid', split_rule: 'equal', timing: 'postpaid', sort_order: 10, active: true },
  { id: 'net', label_bn: 'নেট', label_en: 'Internet', split_rule: 'equal', timing: 'postpaid', sort_order: 20, active: true },
  { id: 'current', label_bn: 'কারেন্ট', label_en: 'Electricity', split_rule: 'equal', timing: 'postpaid', sort_order: 30, active: true },
  { id: 'gas', label_bn: 'গ্যাস', label_en: 'Gas', split_rule: 'equal', timing: 'postpaid', sort_order: 40, active: true },
  { id: 'water', label_bn: 'পানি', label_en: 'Water', split_rule: 'equal', timing: 'postpaid', sort_order: 50, active: true },
  { id: 'guard', label_bn: 'দারোয়ান', label_en: 'Security Guard', split_rule: 'equal', timing: 'postpaid', sort_order: 60, active: true },
  { id: 'garbage', label_bn: 'ময়লা', label_en: 'Waste Disposal', split_rule: 'equal', timing: 'postpaid', sort_order: 70, active: true },
  { id: 'sonsthapon', label_bn: 'সংস্থাপন', label_en: 'Setup / Maintenance', split_rule: 'equal', timing: 'postpaid', sort_order: 80, active: true },
  { id: ROOM_RENT_CATEGORY_ID, label_bn: 'বাসা ভাড়া', label_en: 'House Rent', split_rule: 'per_member', timing: 'prepaid', sort_order: 90, active: true, builtin: 'room_rent' },
];

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
