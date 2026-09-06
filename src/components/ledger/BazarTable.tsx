import { useState, type FormEvent } from 'react';
import { addDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { Doc } from '../../hooks/useCollection';
import type { ExpenseDoc } from '../../hooks/useMonthEntries';
import type { MemberDoc } from '../../hooks/useMembers';
import { formatDateId, monthRange, todayId } from '../../lib/dates';
import { formatTk, parseAmount } from '../../lib/numbers';
import { messCol, messDoc } from '../../lib/paths';
import AmountInput from '../ui/AmountInput';

interface Props {
  messId: string;
  monthId: string;
  members: MemberDoc[];
  expenses: Doc<ExpenseDoc>[];
  suggestions: string[];
  disabled?: boolean;
}

interface RowForm {
  date: string;
  user_id: string;
  amount: string;
  expense_type: 'personal' | 'from_fund';
  items_description: string;
}

/** Manager view of a month's bazar rows with inline add, edit and delete. */
export default function BazarTable({ messId, monthId, members, expenses, suggestions, disabled }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const range = monthRange(monthId);
  const defaultDate = todayId() >= range.start && todayId() <= range.end ? todayId() : range.end;
  const blank = (): RowForm => ({ date: defaultDate, user_id: members[0]?.uid ?? '', amount: '', expense_type: 'personal', items_description: '' });
  const [form, setForm] = useState<RowForm>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name || uid;
  const rows = [...expenses].sort((a, b) => a.data.date.localeCompare(b.data.date));
  const total = rows.reduce((s, r) => s + r.data.amount_spent, 0);

  const startEdit = (row: Doc<ExpenseDoc>) => {
    setEditingId(row.id);
    setForm({ date: row.data.date, user_id: row.data.user_id, amount: String(row.data.amount_spent), expense_type: row.data.expense_type, items_description: row.data.items_description || '' });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.user_id || amount === null || amount <= 0) return toast(t('invalidAmount'), { tone: 'error' });
    if (form.date < range.start || form.date > range.end) return toast(t('dateOutsideMonth'), { tone: 'error' });
    setBusy(true);
    try {
      const data = { date: form.date, user_id: form.user_id, amount_spent: amount, expense_type: form.expense_type, items_description: form.items_description.trim() };
      if (editingId) await updateDoc(messDoc(db, messId, 'bazar_expenses', editingId), { ...data, updated_at: serverTimestamp() });
      else await addDoc(messCol(db, messId, 'bazar_expenses'), { ...data, timestamp: serverTimestamp() });
      toast(editingId ? t('bazarUpdated') : t('bazarAdded'));
      setEditingId(null);
      setForm({ ...blank(), date: form.date });
    } catch (err) {
      console.error('Bazar row save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Doc<ExpenseDoc>) => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteDoc(messDoc(db, messId, 'bazar_expenses', row.id));
      toast(t('entryDeleted'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const inputClass = 'w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm';

  return (
    <div className="space-y-4">
      {!disabled && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-gray-50 border border-gray-100 rounded-lg p-3">
          <div className="col-span-2 md:col-span-6 text-sm font-semibold text-gray-700">{editingId ? t('editing') : t('addRow')}</div>
          <div><label className="block text-xs text-gray-500 mb-1">{t('date')}</label><input type="date" min={range.start} max={range.end} className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
          <div><label className="block text-xs text-gray-500 mb-1">{t('member')}</label>
            <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">{t('amountTk')}</label><AmountInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} className="!py-1.5 !text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">{t('type')}</label>
            <select className={inputClass} value={form.expense_type} onChange={(e) => setForm({ ...form, expense_type: e.target.value as RowForm['expense_type'] })}>
              <option value="personal">{t('personalMoney')}</option>
              <option value="from_fund">{t('fromFund')}</option>
            </select></div>
          <div className="col-span-2 md:col-span-1"><label className="block text-xs text-gray-500 mb-1">{t('itemsDesc')}</label>
            <input list="ledger-items" className={inputClass} value={form.items_description} onChange={(e) => setForm({ ...form, items_description: e.target.value })} />
            <datalist id="ledger-items">{suggestions.map((s) => <option key={s} value={s} />)}</datalist></div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 h-9 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">{editingId ? t('update') : t('add')}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(blank()); }} className="h-9 px-3 text-sm text-gray-600 border border-gray-200 rounded-lg">{t('cancel')}</button>}
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <th className="p-2 text-left font-medium">{t('date')}</th>
              <th className="p-2 text-left font-medium">{t('member')}</th>
              <th className="p-2 text-left font-medium">{t('itemsDesc')}</th>
              <th className="p-2 text-left font-medium">{t('type')}</th>
              <th className="p-2 text-right font-medium">{t('amountTk')}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={`border-b border-gray-100 last:border-0 ${editingId === row.id ? 'bg-blue-50' : ''}`}>
                <td className="p-2 text-gray-500 whitespace-nowrap">{formatDateId(row.data.date)}</td>
                <td className="p-2 text-gray-900">{nameOf(row.data.user_id)}</td>
                <td className="p-2 text-gray-700">{row.data.items_description}</td>
                <td className="p-2 text-gray-500">{row.data.expense_type === 'from_fund' ? t('fromFund') : t('personalMoney')}</td>
                <td className="p-2 text-right font-medium text-gray-900">{formatTk(row.data.amount_spent, lang, 0)}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {!disabled && (
                    <>
                      <button onClick={() => startEdit(row)} className="text-xs font-medium text-blue-600 px-2">{t('edit')}</button>
                      <button onClick={() => remove(row)} className="text-xs font-medium text-red-600 px-2">{t('delete')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">{t('noRows')}</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="bg-gray-50 font-semibold text-gray-900"><td colSpan={4} className="p-2">{t('totals')}</td><td className="p-2 text-right">{formatTk(total, lang, 0)}</td><td></td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
