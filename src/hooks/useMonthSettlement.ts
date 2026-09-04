import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useCollection } from './useCollection';
import { useMonths, type MonthDoc } from './useMonths';
import { useMonthEntries } from './useMonthEntries';
import { useUsers } from './useUsers';
import { useCostCategories } from './useCostCategories';
import { useMealTypes } from './useMealTypes';
import { buildSettlementInput } from '../lib/closeMonth';
import { sortCategories, type CostCategory } from '../lib/costCategories';
import type { MealType } from '../lib/mealTypes';
import { computeSettlement, type SettlementCategory, type SettlementResult, type SettlementRow } from '../lib/settlement';

export type SettlementMode = 'live' | 'closed' | 'legacy' | 'missing';

export interface MonthSettlement {
  month: MonthDoc | null;
  mode: SettlementMode;
  rows: SettlementRow[];
  categories: CostCategory[];
  mealTypes: MealType[];
  totals: Pick<SettlementResult, 'meal_rate' | 'total_meals' | 'total_bazar' | 'total_personal_bazar' | 'total_fund_spending' | 'total_deposits' | 'fund_cash_on_hand' | 'category_totals' | 'grand' | 'warnings'> | null;
  loading: boolean;
}

function snapshotToCategories(snapshot: SettlementCategory[] | undefined, fallback: CostCategory[]): CostCategory[] {
  if (!snapshot || snapshot.length === 0) return fallback;
  return sortCategories(snapshot.map((c) => ({ ...c })));
}

/**
 * The settlement for one month from whichever source applies:
 * - active month: computed live from entries (preview),
 * - closed month: the stored settlement rows (all rows for the manager, or just `onlyUid`),
 * - month closed before dynamic categories existed: totals only.
 */
export function useMonthSettlement(monthId: string | null, options: { onlyUid?: string; applyAdvance?: boolean } = {}): MonthSettlement {
  const { onlyUid, applyAdvance = true } = options;
  const { months, loading: monthsLoading } = useMonths();
  const month = monthId ? months.find((m) => m.id === monthId) ?? null : null;
  const isActive = month?.status === 'active';
  const isClosed = month?.status === 'closed';
  const hasRows = isClosed && Boolean(month?.settlement_version);

  const { users, loading: usersLoading } = useUsers();
  const { categories: liveCategories } = useCostCategories();
  const { mealTypes: liveMealTypes } = useMealTypes();
  const entries = useMonthEntries(isActive ? monthId : null);

  // Closed month, manager view: list all rows.
  const rowsQuery = useCollection<SettlementRow>(
    () => (hasRows && !onlyUid && monthId ? query(collection(db, 'months', monthId, 'settlements')) : null),
    `settlements:${hasRows && !onlyUid ? monthId : 'none'}`,
  );

  // Closed month, member view: only the member's own row is readable.
  const [ownRow, setOwnRow] = useState<SettlementRow | null>(null);
  const [ownLoading, setOwnLoading] = useState(false);
  useEffect(() => {
    if (!hasRows || !onlyUid || !monthId) {
      setOwnRow(null);
      return;
    }
    let cancelled = false;
    setOwnLoading(true);
    getDoc(doc(db, 'months', monthId, 'settlements', onlyUid))
      .then((snap) => {
        if (!cancelled) setOwnRow(snap.exists() ? (snap.data() as SettlementRow) : null);
      })
      .catch((err) => console.error('Could not load settlement row', err))
      .finally(() => {
        if (!cancelled) setOwnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasRows, onlyUid, monthId]);

  const categories = useMemo(
    () => (isActive ? liveCategories : snapshotToCategories(month?.categories_snapshot, liveCategories)),
    [isActive, liveCategories, month?.categories_snapshot],
  );
  const mealTypes = useMemo<MealType[]>(
    () => (isActive || !month?.meal_types_snapshot?.length ? liveMealTypes : sortCategories(month.meal_types_snapshot.map((m) => ({ ...m })))),
    [isActive, liveMealTypes, month?.meal_types_snapshot],
  );

  const live = useMemo(() => {
    if (!isActive || !month) return null;
    return computeSettlement(
      buildSettlementInput({
        month,
        users,
        categories,
        mealTypes,
        entries: { meals: entries.meals.map((d) => d.data), expenses: entries.expenses.map((d) => d.data), payments: entries.payments.map((d) => d.data) },
        applyAdvance,
      }),
    );
  }, [isActive, month, users, categories, mealTypes, entries, applyAdvance]);

  if (!monthId || (!month && !monthsLoading)) {
    return { month: null, mode: 'missing', rows: [], categories, mealTypes, totals: null, loading: monthsLoading };
  }

  if (live) {
    const rows = onlyUid ? live.rows.filter((r) => r.uid === onlyUid) : live.rows;
    return { month, mode: 'live', rows, categories, mealTypes, totals: live, loading: entries.loading || usersLoading };
  }

  if (hasRows && month) {
    const rows = onlyUid ? (ownRow ? [ownRow] : []) : rowsQuery.docs.map((d) => d.data).sort((a, b) => a.name.localeCompare(b.name));
    return {
      month,
      mode: 'closed',
      rows,
      categories,
      mealTypes,
      totals: {
        meal_rate: month.meal_rate ?? 0,
        total_meals: month.total_meals ?? 0,
        total_bazar: month.total_bazar ?? 0,
        total_personal_bazar: month.total_personal_bazar ?? 0,
        total_fund_spending: month.total_fund_spending ?? 0,
        total_deposits: month.total_deposits ?? 0,
        fund_cash_on_hand: month.fund_cash_on_hand ?? 0,
        category_totals: month.category_totals ?? {},
        grand: month.grand ?? { charges: 0, credits: 0, net_payable: 0 },
        warnings: month.warnings ?? [],
      },
      loading: onlyUid ? ownLoading : rowsQuery.loading,
    };
  }

  if (month?.status === 'closed') {
    return {
      month,
      mode: 'legacy',
      rows: [],
      categories,
      mealTypes,
      totals: {
        meal_rate: month.meal_rate ?? 0,
        total_meals: month.total_meals ?? 0,
        total_bazar: month.total_bazar ?? 0,
        total_personal_bazar: 0,
        total_fund_spending: 0,
        total_deposits: 0,
        fund_cash_on_hand: 0,
        category_totals: month.fixed_costs ?? {},
        grand: { charges: (month.fixed_costs_total ?? 0) + (month.total_bazar ?? 0), credits: 0, net_payable: 0 },
        warnings: [],
      },
      loading: false,
    };
  }

  return { month: month ?? null, mode: 'missing', rows: [], categories, mealTypes, totals: null, loading: monthsLoading };
}
