import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { settlementsCol } from '../lib/paths';
import type { SettlementRow } from '../lib/settlement';
import { useMonths, type MonthDoc } from './useMonths';

export interface MemberYearTotals {
  uid: string;
  name: string;
  months: number;
  meal_count: number;
  meal_cost: number;
  total_charges: number;
  credits: number;
  net_payable: number;
}

/**
 * Totals across the closed months of one year. Settlement rows are immutable
 * once a month is closed, so they are fetched once per messId+year rather
 * than subscribed to.
 */
export function useYearSummary(year: number): { months: MonthDoc[]; members: MemberYearTotals[]; loading: boolean } {
  const { messId } = useMess();
  const { months: allMonths, loading: monthsLoading } = useMonths();
  const months = allMonths.filter((m) => m.id.startsWith(`${year}-`)).sort((a, b) => a.id.localeCompare(b.id));
  const closedIds = months.filter((m) => m.status === 'closed' && m.settlement_version).map((m) => m.id);
  const key = `${messId}:${year}:${closedIds.join(',')}`;

  const [members, setMembers] = useState<MemberYearTotals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!messId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(closedIds.map((monthId) => getDocs(settlementsCol(db, messId, monthId))))
      .then((snapshots) => {
        if (cancelled) return;
        const totals = new Map<string, MemberYearTotals>();
        for (const snap of snapshots) {
          for (const d of snap.docs) {
            const row = d.data() as SettlementRow;
            const current = totals.get(d.id) ?? { uid: d.id, name: row.name, months: 0, meal_count: 0, meal_cost: 0, total_charges: 0, credits: 0, net_payable: 0 };
            current.months += 1;
            current.meal_count += row.meal_count;
            current.meal_cost += row.meal_cost;
            current.total_charges += row.total_charges;
            current.credits += row.credits?.total ?? 0;
            current.net_payable += row.net_payable;
            current.name = row.name || current.name;
            totals.set(d.id, current);
          }
        }
        const round = (n: number) => Math.round(n * 100) / 100;
        setMembers(
          [...totals.values()]
            .map((m) => ({ ...m, meal_count: round(m.meal_count), meal_cost: round(m.meal_cost), total_charges: round(m.total_charges), credits: round(m.credits), net_payable: round(m.net_payable) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error('Year summary failed', err);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { months, members, loading: loading || monthsLoading };
}
