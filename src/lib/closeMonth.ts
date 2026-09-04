import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { monthRange } from './dates';
import { ROOM_RENT_CATEGORY_ID, type CostCategory } from './costCategories';
import type { MealType } from './mealTypes';
import { computeSettlement, SETTLEMENT_VERSION, type SettlementInput, type SettlementResult } from './settlement';
import type { MonthDoc } from '../hooks/useMonths';
import type { ExpenseDoc, MealDoc, PaymentDoc } from '../hooks/useMonthEntries';

export interface MemberLike {
  uid: string;
  name: string;
  advance_balance?: number;
  room_rent?: number;
}

export interface EntryBundle {
  meals: MealDoc[];
  expenses: ExpenseDoc[];
  payments: PaymentDoc[];
}

/** Per-member amounts for per_member categories, with the built-in rent taken from user profiles. */
export function effectiveMemberCosts(month: Pick<MonthDoc, 'member_costs'>, users: MemberLike[], categories: CostCategory[]): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const category of categories) {
    if (category.split_rule !== 'per_member') continue;
    if (category.builtin === 'room_rent' || category.id === ROOM_RENT_CATEGORY_ID) {
      result[category.id] = Object.fromEntries(users.map((user) => [user.uid, Number(user.room_rent) || 0]));
    } else {
      result[category.id] = { ...(month.member_costs?.[category.id] || {}) };
    }
  }
  return result;
}

/** Assembles the pure settlement input from live documents (used for both preview and close). */
export function buildSettlementInput(args: {
  month: MonthDoc;
  users: MemberLike[];
  categories: CostCategory[];
  mealTypes: MealType[];
  entries: EntryBundle;
  applyAdvance: boolean;
}): SettlementInput {
  const { month, users, categories, mealTypes, entries, applyAdvance } = args;
  return {
    monthId: month.month_id || month.id,
    members: users.map((user) => ({ uid: user.uid, name: user.name || user.uid, advance_balance: Number(user.advance_balance) || 0 })),
    categories: categories.map((category) => ({
      id: category.id,
      label_bn: category.label_bn,
      label_en: category.label_en,
      split_rule: category.split_rule,
      timing: category.timing,
      active: category.active,
      sort_order: category.sort_order,
      builtin: category.builtin,
    })),
    mealTypes: mealTypes.map((type) => ({ id: type.id, weight: type.weight })),
    fixedCosts: month.fixed_costs || {},
    memberCosts: effectiveMemberCosts(month, users, categories),
    memberWeights: month.member_weights || {},
    meals: entries.meals,
    expenses: entries.expenses,
    payments: entries.payments,
    applyAdvance,
  };
}

async function fetchMonthEntries(db: Firestore, monthId: string): Promise<EntryBundle> {
  const range = monthRange(monthId);
  const load = async <T,>(name: string): Promise<T[]> => {
    const snap = await getDocs(query(collection(db, name), where('date', '>=', range.start), where('date', '<=', range.end)));
    return snap.docs.map((d) => d.data() as T);
  };
  const [meals, expenses, payments] = await Promise.all([load<MealDoc>('daily_meals'), load<ExpenseDoc>('bazar_expenses'), load<PaymentDoc>('payments')]);
  return { meals, expenses, payments };
}

export class MonthCloseError extends Error {
  constructor(public code: 'NOT_ACTIVE' | 'BLOCKING_WARNINGS', message: string, public warnings: string[] = []) {
    super(message);
  }
}

export const BLOCKING_WARNINGS = ['NO_MEALS'];

/**
 * Closes a month: re-reads everything from Firestore, computes the settlement,
 * and writes the month totals, one settlement row per member and (optionally)
 * the members' new advance balances in a single batch.
 */
export async function closeMonth(
  db: Firestore,
  args: { monthId: string; users: MemberLike[]; categories: CostCategory[]; mealTypes: MealType[]; applyAdvance: boolean; closedBy: string },
): Promise<SettlementResult> {
  const monthRef = doc(db, 'months', args.monthId);
  const monthSnap = await getDoc(monthRef);
  const month = { id: monthSnap.id, ...(monthSnap.data() as Omit<MonthDoc, 'id'>) };
  if (!monthSnap.exists() || month.status !== 'active') {
    throw new MonthCloseError('NOT_ACTIVE', 'This month is not active.');
  }

  const entries = await fetchMonthEntries(db, args.monthId);
  const input = buildSettlementInput({ month, users: args.users, categories: args.categories, mealTypes: args.mealTypes, entries, applyAdvance: args.applyAdvance });
  const result = computeSettlement(input);

  const blocking = result.warnings.filter((w) => BLOCKING_WARNINGS.includes(w));
  if (blocking.length > 0) {
    throw new MonthCloseError('BLOCKING_WARNINGS', 'Fix the warnings before closing the month.', blocking);
  }

  const batch = writeBatch(db);
  batch.update(monthRef, {
    status: 'closed',
    member_costs: input.memberCosts,
    categories_snapshot: input.categories,
    meal_types_snapshot: args.mealTypes.map(({ id, label_bn, label_en, weight, sort_order, active }) => ({ id, label_bn, label_en, weight, sort_order, active })),
    meal_rate: result.meal_rate,
    total_meals: result.total_meals,
    total_bazar: result.total_bazar,
    total_personal_bazar: result.total_personal_bazar,
    total_fund_spending: result.total_fund_spending,
    total_deposits: result.total_deposits,
    fund_cash_on_hand: result.fund_cash_on_hand,
    category_totals: result.category_totals,
    grand: result.grand,
    warnings: result.warnings,
    advance_applied: args.applyAdvance,
    closed_at: serverTimestamp(),
    closed_by: args.closedBy,
    settlement_version: SETTLEMENT_VERSION,
  });

  const knownUids = new Set(args.users.map((user) => user.uid));
  for (const row of result.rows) {
    batch.set(doc(db, 'months', args.monthId, 'settlements', row.uid), row);
    if (args.applyAdvance && knownUids.has(row.uid) && row.advance_after !== row.advance_before) {
      batch.update(doc(db, 'users', row.uid), { advance_balance: row.advance_after });
    }
  }

  await batch.commit();
  return result;
}

/** Reverts a close: restores advances, deletes settlement rows and reactivates the month. */
export async function reopenMonth(db: Firestore, monthId: string): Promise<void> {
  const monthRef = doc(db, 'months', monthId);
  const monthSnap = await getDoc(monthRef);
  const month = monthSnap.data() as (Omit<MonthDoc, 'id'> & { advance_applied?: boolean }) | undefined;
  if (!month || month.status !== 'closed') throw new MonthCloseError('NOT_ACTIVE', 'This month is not closed.');

  const settlements = await getDocs(collection(db, 'months', monthId, 'settlements'));
  const batch = writeBatch(db);
  for (const row of settlements.docs) {
    const data = row.data() as { advance_before?: number; advance_after?: number };
    if (month.advance_applied && typeof data.advance_before === 'number' && data.advance_before !== data.advance_after) {
      const userSnap = await getDoc(doc(db, 'users', row.id));
      if (userSnap.exists()) batch.update(doc(db, 'users', row.id), { advance_balance: data.advance_before });
    }
    batch.delete(row.ref);
  }
  batch.update(monthRef, {
    status: 'active',
    closed_at: deleteField(),
    closed_by: deleteField(),
    grand: deleteField(),
    warnings: deleteField(),
    advance_applied: deleteField(),
  });
  await batch.commit();
}
