import { query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { messCol } from '../lib/paths';
import type { SettlementCategory, SettlementMealType } from '../lib/settlement';
import { useCollection } from './useCollection';

export interface MonthDoc {
  id: string;
  month_id: string;
  status: 'active' | 'closed';
  fixed_costs?: Record<string, number>;
  member_costs?: Record<string, Record<string, number>>;
  member_weights?: Record<string, number>;
  categories_snapshot?: SettlementCategory[];
  meal_types_snapshot?: (SettlementMealType & { label_bn: string; label_en: string; active: boolean; sort_order: number })[];
  meal_rate?: number;
  total_meals?: number;
  total_bazar?: number;
  total_personal_bazar?: number;
  total_fund_spending?: number;
  total_deposits?: number;
  fund_cash_on_hand?: number;
  category_totals?: Record<string, number>;
  grand?: { charges: number; credits: number; net_payable: number };
  warnings?: string[];
  closed_at?: unknown;
  settlement_version?: number;
  // Legacy fields from months closed before dynamic categories existed.
  fixed_costs_total?: number;
  member_rents?: Record<string, number>;
  total_room_rent?: number;
}

export function useActiveMonth(): { activeMonth: MonthDoc | null; loading: boolean } {
  const { messId } = useMess();
  const { docs, loading } = useCollection<Omit<MonthDoc, 'id'>>(
    () => (messId ? query(messCol(db, messId, 'months'), where('status', '==', 'active')) : null),
    `months:active:${messId}`,
  );
  // Newest first if more than one is accidentally active.
  const sorted = docs.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => b.id.localeCompare(a.id));
  return { activeMonth: sorted[0] ?? null, loading };
}

export function useMonths(): { months: MonthDoc[]; loading: boolean } {
  const { messId } = useMess();
  const { docs, loading } = useCollection<Omit<MonthDoc, 'id'>>(() => (messId ? query(messCol(db, messId, 'months')) : null), `months:all:${messId}`);
  const months = docs.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => b.id.localeCompare(a.id));
  return { months, loading };
}
