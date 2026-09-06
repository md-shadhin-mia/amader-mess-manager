/**
 * Pure month bookkeeping helpers shared by closeMonth.ts and the UI.
 * No Firebase imports so they can be unit-tested with node:test.
 */
import { ROOM_RENT_CATEGORY_ID, type CostCategory } from './defaults';

export type MonthStatus = 'active' | 'closed' | 'backfill';
export type RentSource = 'profile' | 'month';

export interface MemberLike {
  uid: string;
  name: string;
  advance_balance?: number;
  room_rent?: number;
  /** Members who left keep their history but get no share of equal-split costs by default. */
  status?: 'active' | 'left';
}

export interface MonthLike {
  id: string;
  status: MonthStatus;
  member_costs?: Record<string, Record<string, number>>;
  member_weights?: Record<string, number>;
  rent_source?: RentSource;
  advance_applied?: boolean;
}

export function isMonthEditable(month: Pick<MonthLike, 'status'> | null | undefined): boolean {
  return month?.status === 'active' || month?.status === 'backfill';
}

/**
 * Per-member amounts for per_member categories. The built-in rent comes from
 * the profiles unless the month says `rent_source: 'month'`, in which case the
 * amounts stored on the month itself are used (back-filled months must use
 * the rent of that time, not today's).
 */
export function effectiveMemberCosts(
  month: Pick<MonthLike, 'member_costs' | 'rent_source'>,
  users: MemberLike[],
  categories: Pick<CostCategory, 'id' | 'split_rule' | 'builtin'>[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const category of categories) {
    if (category.split_rule !== 'per_member') continue;
    const isRent = category.builtin === 'room_rent' || category.id === ROOM_RENT_CATEGORY_ID;
    if (isRent && month.rent_source !== 'month') {
      result[category.id] = Object.fromEntries(users.map((user) => [user.uid, Number(user.room_rent) || 0]));
    } else {
      result[category.id] = { ...(month.member_costs?.[category.id] || {}) };
    }
  }
  return result;
}

/** Weights for equal-split costs: members who left default to 0 unless the month overrides them. */
export function effectiveMemberWeights(month: Pick<MonthLike, 'member_weights'>, users: MemberLike[]): Record<string, number> {
  return {
    ...Object.fromEntries(users.filter((user) => user.status === 'left').map((user) => [user.uid, 0])),
    ...(month.member_weights || {}),
  };
}

/** Status a closed month returns to when reopened. */
export function decideReopenStatus(args: { monthId: string; currentMonthId: string; hasActiveMonth: boolean }): MonthStatus {
  return args.monthId === args.currentMonthId && !args.hasActiveMonth ? 'active' : 'backfill';
}

/**
 * Reopening restores each member's advance_before, which is only correct for
 * the most recently closed month. Older months that applied advances stay closed.
 */
export function canReopen(month: Pick<MonthLike, 'id' | 'status' | 'advance_applied'>, latestClosedMonthId: string | null): { ok: boolean; reason?: 'NOT_CLOSED' | 'ADVANCE_LOCKED' } {
  if (month.status !== 'closed') return { ok: false, reason: 'NOT_CLOSED' };
  if (month.advance_applied && month.id !== latestClosedMonthId) return { ok: false, reason: 'ADVANCE_LOCKED' };
  return { ok: true };
}

/** Initial document for a back-filled past month. */
export function backfillMonthDoc(args: {
  monthId: string;
  members: MemberLike[];
  previous?: { fixed_costs?: Record<string, number>; member_costs?: Record<string, Record<string, number>> } | null;
}) {
  const rent = Object.fromEntries(args.members.map((m) => [m.uid, Number(m.room_rent) || 0]));
  const memberCosts = { ...(args.previous?.member_costs || {}) };
  memberCosts[ROOM_RENT_CATEGORY_ID] = { ...(args.previous?.member_costs?.[ROOM_RENT_CATEGORY_ID] || {}), ...rent };
  return {
    month_id: args.monthId,
    status: 'backfill' as const,
    rent_source: 'month' as const,
    fixed_costs: { ...(args.previous?.fixed_costs || {}) },
    member_costs: memberCosts,
    member_weights: Object.fromEntries(args.members.filter((m) => m.status === 'left').map((m) => [m.uid, 0])),
    total_meals: 0,
    total_bazar: 0,
    meal_rate: 0,
  };
}
