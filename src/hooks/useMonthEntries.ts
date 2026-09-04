import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { monthRange } from '../lib/dates';
import { useCollection, type Doc } from './useCollection';

export interface MealDoc {
  date: string;
  user_id: string;
  meals?: Record<string, number>;
  meal_count: number;
  updated_at?: unknown;
}

export interface ExpenseDoc {
  date: string;
  user_id: string;
  amount_spent: number;
  items_description: string;
  expense_type: 'personal' | 'from_fund';
  timestamp?: unknown;
}

export type PaymentPurpose = 'fund_deposit' | 'prepaid' | 'settlement';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

export interface PaymentDoc {
  date: string;
  user_id: string;
  amount: number;
  purpose: PaymentPurpose;
  category_id?: string;
  status: PaymentStatus;
  note?: string;
  recorded_by: string;
  confirmed_by?: string;
  confirmed_at?: unknown;
  timestamp?: unknown;
}

export interface MonthEntries {
  meals: Doc<MealDoc>[];
  expenses: Doc<ExpenseDoc>[];
  payments: Doc<PaymentDoc>[];
  loading: boolean;
}

/** Live meals, bazar expenses and payments for one month, via single-field range queries on `date`. */
export function useMonthEntries(monthId: string | null): MonthEntries {
  const range = monthId ? monthRange(monthId) : null;
  const make = (name: string) => () =>
    range ? query(collection(db, name), where('date', '>=', range.start), where('date', '<=', range.end)) : null;

  const meals = useCollection<MealDoc>(make('daily_meals'), `daily_meals:${monthId}`);
  const expenses = useCollection<ExpenseDoc>(make('bazar_expenses'), `bazar_expenses:${monthId}`);
  const payments = useCollection<PaymentDoc>(make('payments'), `payments:${monthId}`);

  return {
    meals: meals.docs,
    expenses: expenses.docs,
    payments: payments.docs,
    loading: meals.loading || expenses.loading || payments.loading,
  };
}

/** All payments still waiting for the manager, regardless of month. */
export function usePendingPayments(): { pending: Doc<PaymentDoc>[]; loading: boolean } {
  const { docs, loading } = useCollection<PaymentDoc>(
    () => query(collection(db, 'payments'), where('status', '==', 'pending')),
    'payments:pending',
  );
  return { pending: [...docs].sort((a, b) => a.data.date.localeCompare(b.data.date)), loading };
}
