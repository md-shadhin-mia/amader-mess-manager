/**
 * Pure month-settlement calculation. No Firebase imports so it can run in
 * node tests and in the browser (live preview during an active month).
 *
 * All money is handled in integer paisa internally so every split sums to
 * exactly the amount that was split, then converted back to taka.
 */

import type { CostTiming, SplitRule } from './costCategories';

export interface SettlementMember {
  uid: string;
  name: string;
  advance_balance: number;
}

export interface SettlementCategory {
  id: string;
  label_bn: string;
  label_en: string;
  split_rule: SplitRule;
  timing: CostTiming;
  active: boolean;
  sort_order: number;
  builtin?: 'room_rent';
}

export interface SettlementMealType {
  id: string;
  weight: number;
}

export interface MealInput {
  user_id: string;
  /** Per meal-type counts. When absent, `meal_count` is used (legacy docs). */
  meals?: Record<string, number>;
  meal_count?: number;
}

export interface ExpenseInput {
  user_id: string;
  amount_spent: number;
  expense_type: 'personal' | 'from_fund';
}

export interface PaymentInput {
  user_id: string;
  amount: number;
  purpose: 'fund_deposit' | 'prepaid' | 'settlement';
  status: 'pending' | 'confirmed' | 'rejected';
}

export interface SettlementInput {
  monthId: string;
  members: SettlementMember[];
  categories: SettlementCategory[];
  mealTypes: SettlementMealType[];
  /** Amount per shared category id (equal / by_meals). */
  fixedCosts: Record<string, number>;
  /** Amount per member for per_member categories: { catId: { uid: amount } }. */
  memberCosts: Record<string, Record<string, number>>;
  /** Share of equal-split costs: 1 full, 0.5 half month, 0 excluded. Missing = 1. */
  memberWeights: Record<string, number>;
  meals: MealInput[];
  expenses: ExpenseInput[];
  payments: PaymentInput[];
  /** Apply the member's advance balance against what they owe. */
  applyAdvance: boolean;
}

export interface SettlementRow {
  uid: string;
  name: string;
  weight: number;
  meals: Record<string, number>;
  meal_count: number;
  meal_cost: number;
  shares: Record<string, number>;
  prepaid_charges: number;
  postpaid_charges: number;
  total_charges: number;
  credits: { deposits: number; prepaid_paid: number; settlement_paid: number; personal_bazar: number; total: number };
  fund_spent: number;
  gross_due: number;
  advance_before: number;
  advance_applied: number;
  net_payable: number;
  advance_after: number;
  /** What is collectable right now: prepaid shares minus prepaid payments. */
  due_now: number;
}

export interface SettlementResult {
  month_id: string;
  rows: SettlementRow[];
  meal_rate: number;
  total_meals: number;
  total_bazar: number;
  total_personal_bazar: number;
  total_fund_spending: number;
  total_deposits: number;
  fund_cash_on_hand: number;
  category_totals: Record<string, number>;
  grand: { charges: number; credits: number; net_payable: number };
  warnings: string[];
}

export const SETTLEMENT_VERSION = 1;

const toPaisa = (taka: number): number => (Number.isFinite(taka) ? Math.round(taka * 100) : 0);
const toTaka = (paisa: number): number => paisa / 100;

/**
 * Splits `total` paisa across ids proportionally to their weights using the
 * largest-remainder method. The shares always sum to exactly `total`, and the
 * result is deterministic (ties broken by id).
 */
export function allocate(total: number, weights: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  let sum = 0;
  for (const [id, w] of weights) {
    const safe = Number.isFinite(w) && w > 0 ? w : 0;
    result.set(id, 0);
    sum += safe;
  }
  if (total === 0 || sum === 0) return result;

  const exact: { id: string; share: number; base: number }[] = [];
  let allocated = 0;
  for (const [id, w] of weights) {
    const safe = Number.isFinite(w) && w > 0 ? w : 0;
    const share = (total * safe) / sum;
    const base = Math.floor(share);
    exact.push({ id, share, base });
    allocated += base;
  }
  let remainder = total - allocated;
  exact.sort((a, b) => b.share - b.base - (a.share - a.base) || a.id.localeCompare(b.id));
  for (const entry of exact) {
    let value = entry.base;
    if (remainder > 0) {
      value += 1;
      remainder -= 1;
    }
    result.set(entry.id, value);
  }
  return result;
}

function mealCountOfEntry(entry: MealInput, weights: Map<string, number>, warnings: Set<string>): { count: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  if (entry.meals && typeof entry.meals === 'object') {
    let total = 0;
    for (const [typeId, raw] of Object.entries(entry.meals)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        warnings.add('INVALID_MEAL_COUNT');
        continue;
      }
      if (n === 0) continue;
      if (!weights.has(typeId)) warnings.add(`UNKNOWN_MEAL_TYPE:${typeId}`);
      byType[typeId] = (byType[typeId] || 0) + n;
      total += n * (weights.get(typeId) ?? 1);
    }
    return { count: total, byType };
  }
  const n = Number(entry.meal_count);
  if (!Number.isFinite(n) || n < 0) {
    warnings.add('INVALID_MEAL_COUNT');
    return { count: 0, byType };
  }
  if (n > 0) byType.legacy = n;
  return { count: n, byType };
}

export function computeSettlement(input: SettlementInput): SettlementResult {
  const warnings = new Set<string>();
  const mealWeights = new Map(input.mealTypes.map((type) => [type.id, Number.isFinite(type.weight) ? type.weight : 1]));

  // 1. Universe of members: configured members plus anyone who left entries.
  const members = new Map<string, SettlementMember>();
  for (const member of input.members) members.set(member.uid, member);
  const ensureMember = (uid: string) => {
    if (!uid) return;
    if (!members.has(uid)) {
      members.set(uid, { uid, name: '(unknown)', advance_balance: 0 });
      warnings.add(`UNKNOWN_MEMBER:${uid}`);
    }
  };
  for (const entry of input.meals) ensureMember(entry.user_id);
  for (const entry of input.expenses) ensureMember(entry.user_id);
  for (const entry of input.payments) ensureMember(entry.user_id);

  const uids = [...members.keys()].sort();
  const weightOf = (uid: string): number => {
    if (!input.members.some((m) => m.uid === uid)) return 0;
    const w = input.memberWeights[uid];
    if (w === undefined || w === null) return 1;
    return Number.isFinite(w) && w >= 0 ? w : 0;
  };

  // 2. Per-member aggregates, in paisa.
  const mealCount = new Map<string, number>();
  const mealsByType = new Map<string, Record<string, number>>();
  const personal = new Map<string, number>();
  const fundSpent = new Map<string, number>();
  const deposits = new Map<string, number>();
  const prepaidPaid = new Map<string, number>();
  const settlementPaid = new Map<string, number>();
  for (const uid of uids) {
    mealCount.set(uid, 0);
    mealsByType.set(uid, {});
    personal.set(uid, 0);
    fundSpent.set(uid, 0);
    deposits.set(uid, 0);
    prepaidPaid.set(uid, 0);
    settlementPaid.set(uid, 0);
  }

  for (const entry of input.meals) {
    if (!entry.user_id) continue;
    const { count, byType } = mealCountOfEntry(entry, mealWeights, warnings);
    mealCount.set(entry.user_id, (mealCount.get(entry.user_id) || 0) + count);
    const acc = mealsByType.get(entry.user_id)!;
    for (const [typeId, n] of Object.entries(byType)) acc[typeId] = (acc[typeId] || 0) + n;
  }

  for (const entry of input.expenses) {
    if (!entry.user_id) continue;
    const amount = toPaisa(entry.amount_spent);
    if (amount < 0) {
      warnings.add('NEGATIVE_EXPENSE');
      continue;
    }
    const target = entry.expense_type === 'from_fund' ? fundSpent : personal;
    target.set(entry.user_id, (target.get(entry.user_id) || 0) + amount);
  }

  for (const entry of input.payments) {
    if (!entry.user_id || entry.status !== 'confirmed') continue;
    const amount = toPaisa(entry.amount);
    if (amount < 0) {
      warnings.add('NEGATIVE_PAYMENT');
      continue;
    }
    const target = entry.purpose === 'fund_deposit' ? deposits : entry.purpose === 'prepaid' ? prepaidPaid : settlementPaid;
    target.set(entry.user_id, (target.get(entry.user_id) || 0) + amount);
  }

  // 3. Meal rate.
  const totalMeals = [...mealCount.values()].reduce((a, b) => a + b, 0);
  const totalPersonal = [...personal.values()].reduce((a, b) => a + b, 0);
  const totalFundSpending = [...fundSpent.values()].reduce((a, b) => a + b, 0);
  const totalBazar = totalPersonal + totalFundSpending;
  const totalDeposits = [...deposits.values()].reduce((a, b) => a + b, 0);
  if (totalMeals === 0 && totalBazar > 0) warnings.add('NO_MEALS');
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0; // paisa per meal

  // 4. Allocation.
  const mealCost = allocate(totalBazar, new Map(uids.map((uid) => [uid, mealCount.get(uid) || 0])));
  if (totalBazar > 0 && totalMeals === 0) warnings.add('UNALLOCATED_BAZAR');

  const activeCategories = input.categories.filter((category) => category.active).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const activeIds = new Set(activeCategories.map((category) => category.id));
  for (const [catId, amount] of Object.entries(input.fixedCosts)) {
    if (!activeIds.has(catId) && toPaisa(amount) !== 0) warnings.add(`INACTIVE_CATEGORY_HAS_AMOUNT:${catId}`);
  }

  const shares = new Map<string, Map<string, number>>(); // catId → uid → paisa
  const categoryTotals: Record<string, number> = {};
  const memberWeightMap = new Map(uids.map((uid) => [uid, weightOf(uid)]));
  const sumWeights = [...memberWeightMap.values()].reduce((a, b) => a + b, 0);

  for (const category of activeCategories) {
    let split: Map<string, number>;
    if (category.split_rule === 'per_member') {
      split = new Map();
      const amounts = input.memberCosts[category.id] || {};
      for (const uid of uids) split.set(uid, toPaisa(amounts[uid] ?? 0));
    } else {
      const total = toPaisa(input.fixedCosts[category.id] ?? 0);
      const weights =
        category.split_rule === 'by_meals'
          ? new Map(uids.map((uid) => [uid, mealCount.get(uid) || 0]))
          : memberWeightMap;
      if (total > 0 && (category.split_rule === 'by_meals' ? totalMeals === 0 : sumWeights === 0)) {
        warnings.add(`UNALLOCATED_CATEGORY:${category.id}`);
      }
      split = allocate(total, weights);
    }
    shares.set(category.id, split);
    categoryTotals[category.id] = toTaka([...split.values()].reduce((a, b) => a + b, 0));
  }

  // 5. Per-member rows.
  const rows: SettlementRow[] = [];
  let grandCharges = 0;
  let grandCredits = 0;
  let grandNet = 0;

  for (const uid of uids) {
    const member = members.get(uid)!;
    const rowShares: Record<string, number> = {};
    let prepaid = 0;
    let postpaid = mealCost.get(uid) || 0;
    for (const category of activeCategories) {
      const amount = shares.get(category.id)?.get(uid) || 0;
      rowShares[category.id] = toTaka(amount);
      if (category.timing === 'prepaid') prepaid += amount;
      else postpaid += amount;
    }
    const totalCharges = prepaid + postpaid;
    const creditDeposits = deposits.get(uid) || 0;
    const creditPrepaid = prepaidPaid.get(uid) || 0;
    const creditSettlement = settlementPaid.get(uid) || 0;
    const creditPersonal = personal.get(uid) || 0;
    const credits = creditDeposits + creditPrepaid + creditSettlement + creditPersonal;
    const grossDue = totalCharges - credits;

    const advanceBefore = toPaisa(member.advance_balance);
    let advanceApplied = 0;
    let netPayable = grossDue;
    let advanceAfter = advanceBefore;
    if (input.applyAdvance) {
      advanceApplied = grossDue > 0 ? Math.min(Math.max(advanceBefore, 0), grossDue) : 0;
      netPayable = grossDue - advanceApplied;
      // Overpayment (negative due) is kept as advance for next month.
      advanceAfter = advanceBefore - advanceApplied + (grossDue < 0 ? -grossDue : 0);
      if (grossDue < 0) netPayable = 0;
    }

    grandCharges += totalCharges;
    grandCredits += credits;
    grandNet += netPayable;

    rows.push({
      uid,
      name: member.name,
      weight: memberWeightMap.get(uid) ?? 0,
      meals: mealsByType.get(uid) || {},
      meal_count: Math.round((mealCount.get(uid) || 0) * 100) / 100,
      meal_cost: toTaka(mealCost.get(uid) || 0),
      shares: rowShares,
      prepaid_charges: toTaka(prepaid),
      postpaid_charges: toTaka(postpaid),
      total_charges: toTaka(totalCharges),
      credits: {
        deposits: toTaka(creditDeposits),
        prepaid_paid: toTaka(creditPrepaid),
        settlement_paid: toTaka(creditSettlement),
        personal_bazar: toTaka(creditPersonal),
        total: toTaka(credits),
      },
      fund_spent: toTaka(fundSpent.get(uid) || 0),
      gross_due: toTaka(grossDue),
      advance_before: toTaka(advanceBefore),
      advance_applied: toTaka(advanceApplied),
      net_payable: toTaka(netPayable),
      advance_after: toTaka(advanceAfter),
      due_now: toTaka(Math.max(prepaid - creditPrepaid, 0)),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));

  return {
    month_id: input.monthId,
    rows,
    meal_rate: Math.round(mealRate) / 100,
    total_meals: Math.round(totalMeals * 100) / 100,
    total_bazar: toTaka(totalBazar),
    total_personal_bazar: toTaka(totalPersonal),
    total_fund_spending: toTaka(totalFundSpending),
    total_deposits: toTaka(totalDeposits),
    fund_cash_on_hand: toTaka(totalDeposits - totalFundSpending),
    category_totals: categoryTotals,
    grand: { charges: toTaka(grandCharges), credits: toTaka(grandCredits), net_payable: toTaka(grandNet) },
    warnings: [...warnings].sort(),
  };
}
