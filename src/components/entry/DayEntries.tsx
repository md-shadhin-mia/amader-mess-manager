import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { Doc } from '../../hooks/useCollection';
import type { ExpenseDoc, PaymentDoc } from '../../hooks/useMonthEntries';
import { formatTk } from '../../lib/numbers';
import { PURPOSE_KEYS } from '../admin/PaymentsInbox';

interface Props {
  expenses: Doc<ExpenseDoc>[];
  payments: Doc<PaymentDoc>[];
  onEditExpense: (expense: Doc<ExpenseDoc>) => void;
  disabled?: boolean;
}

/** The selected day's bazar and payment rows with quick edit / delete. */
export default function DayEntries({ expenses, payments, onEditExpense, disabled }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();

  const remove = async (collectionName: 'bazar_expenses' | 'payments', id: string) => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      toast(t('entryDeleted'));
    } catch (err) {
      console.error('Delete failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  if (expenses.length === 0 && payments.length === 0) {
    return <p className="text-sm text-gray-400">{t('noEntriesYet')}</p>;
  }

  const statusClass: Record<PaymentDoc['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    confirmed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const statusKey: Record<PaymentDoc['status'], 'statusPending' | 'statusConfirmed' | 'statusRejected'> = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    rejected: 'statusRejected',
  };

  return (
    <ul className="divide-y divide-gray-100">
      {expenses.map((e) => (
        <li key={e.id} className="py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 truncate">{e.data.items_description}</p>
            <p className="text-xs text-gray-500">{e.data.expense_type === 'from_fund' ? t('fromFund') : t('personalMoney')}</p>
          </div>
          <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatTk(e.data.amount_spent, lang, 0)}</span>
          {!disabled && (
            <div className="flex gap-1">
              <button onClick={() => onEditExpense(e)} className="text-xs font-medium text-blue-600 px-2 py-1">{t('edit')}</button>
              <button onClick={() => remove('bazar_expenses', e.id)} className="text-xs font-medium text-red-600 px-2 py-1">{t('delete')}</button>
            </div>
          )}
        </li>
      ))}
      {payments.map((p) => (
        <li key={p.id} className="py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">{t(PURPOSE_KEYS[p.data.purpose] ?? 'purposeFund')}</p>
            {p.data.note && <p className="text-xs text-gray-500 truncate">{p.data.note}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[p.data.status]}`}>{t(statusKey[p.data.status])}</span>
          <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatTk(p.data.amount, lang, 0)}</span>
          {!disabled && p.data.status === 'pending' && (
            <button onClick={() => remove('payments', p.id)} className="text-xs font-medium text-red-600 px-2 py-1">{t('delete')}</button>
          )}
        </li>
      ))}
    </ul>
  );
}
