import { useState, type FormEvent } from 'react';
import { deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { Doc } from '../../hooks/useCollection';
import type { PaymentDoc, PaymentPurpose } from '../../hooks/useMonthEntries';
import type { MemberDoc } from '../../hooks/useMembers';
import { formatDateId, monthRange, todayId } from '../../lib/dates';
import { recordManagerPayment } from '../../lib/ledger';
import { formatTk, parseAmount } from '../../lib/numbers';
import { messDoc } from '../../lib/paths';
import { PURPOSE_KEYS } from '../admin/PaymentsInbox';
import AmountInput from '../ui/AmountInput';

interface Props {
  messId: string;
  monthId: string;
  members: MemberDoc[];
  payments: Doc<PaymentDoc>[];
  managerUid: string;
  disabled?: boolean;
}

interface RowForm {
  date: string;
  user_id: string;
  amount: string;
  purpose: PaymentPurpose;
  note: string;
}

/** Manager view of a month's payments (fund deposits, rent, settlement) with add, edit, delete, confirm. */
export default function PaymentsTable({ messId, monthId, members, payments, managerUid, disabled }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const range = monthRange(monthId);
  const defaultDate = todayId() >= range.start && todayId() <= range.end ? todayId() : range.end;
  const blank = (): RowForm => ({ date: defaultDate, user_id: members[0]?.uid ?? '', amount: '', purpose: 'fund_deposit', note: '' });
  const [form, setForm] = useState<RowForm>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name || uid;
  const rows = [...payments].sort((a, b) => a.data.date.localeCompare(b.data.date));
  const confirmedTotal = rows.filter((r) => r.data.status === 'confirmed').reduce((s, r) => s + r.data.amount, 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.user_id || amount === null || amount <= 0) return toast(t('invalidAmount'), { tone: 'error' });
    if (form.date < range.start || form.date > range.end) return toast(t('dateOutsideMonth'), { tone: 'error' });
    setBusy(true);
    try {
      if (editingId) {
        await updateDoc(messDoc(db, messId, 'payments', editingId), { date: form.date, user_id: form.user_id, amount, purpose: form.purpose, note: form.note.trim(), updated_at: serverTimestamp() });
      } else {
        await recordManagerPayment(db, messId, managerUid, { date: form.date, user_id: form.user_id, amount, purpose: form.purpose, note: form.note });
      }
      toast(t('paymentRecorded'));
      setEditingId(null);
      setForm({ ...blank(), date: form.date });
    } catch (err) {
      console.error('Payment row save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row: Doc<PaymentDoc>, status: 'confirmed' | 'rejected') => {
    try {
      await updateDoc(messDoc(db, messId, 'payments', row.id), { status, confirmed_by: managerUid, confirmed_at: serverTimestamp() });
      toast(status === 'confirmed' ? t('paymentConfirmed') : t('paymentRejected'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const remove = async (row: Doc<PaymentDoc>) => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteDoc(messDoc(db, messId, 'payments', row.id));
      toast(t('entryDeleted'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const inputClass = 'w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm';
  const statusClass: Record<PaymentDoc['status'], string> = { pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' };
  const statusKey: Record<PaymentDoc['status'], 'statusPending' | 'statusConfirmed' | 'statusRejected'> = { pending: 'statusPending', confirmed: 'statusConfirmed', rejected: 'statusRejected' };

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
          <div><label className="block text-xs text-gray-500 mb-1">{t('purpose')}</label>
            <select className={inputClass} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as PaymentPurpose })}>
              {(Object.keys(PURPOSE_KEYS) as PaymentPurpose[]).map((p) => <option key={p} value={p}>{t(PURPOSE_KEYS[p])}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">{t('note')}</label><input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
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
              <th className="p-2 text-left font-medium">{t('purpose')}</th>
              <th className="p-2 text-left font-medium">{t('status')}</th>
              <th className="p-2 text-right font-medium">{t('amountTk')}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={`border-b border-gray-100 last:border-0 ${editingId === row.id ? 'bg-blue-50' : ''}`}>
                <td className="p-2 text-gray-500 whitespace-nowrap">{formatDateId(row.data.date)}</td>
                <td className="p-2 text-gray-900">{nameOf(row.data.user_id)}{row.data.note && <span className="block text-xs text-gray-400">{row.data.note}</span>}</td>
                <td className="p-2 text-gray-500">{t(PURPOSE_KEYS[row.data.purpose] ?? 'purposeFund')}</td>
                <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[row.data.status]}`}>{t(statusKey[row.data.status])}</span></td>
                <td className="p-2 text-right font-medium text-gray-900">{formatTk(row.data.amount, lang, 0)}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {!disabled && (
                    <>
                      {row.data.status === 'pending' && <button onClick={() => setStatus(row, 'confirmed')} className="text-xs font-medium text-green-700 px-2">{t('confirm')}</button>}
                      {row.data.status === 'pending' && <button onClick={() => setStatus(row, 'rejected')} className="text-xs font-medium text-red-600 px-2">{t('reject')}</button>}
                      <button onClick={() => { setEditingId(row.id); setForm({ date: row.data.date, user_id: row.data.user_id, amount: String(row.data.amount), purpose: row.data.purpose, note: row.data.note || '' }); }} className="text-xs font-medium text-blue-600 px-2">{t('edit')}</button>
                      <button onClick={() => remove(row)} className="text-xs font-medium text-red-600 px-2">{t('delete')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">{t('noRows')}</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="bg-gray-50 font-semibold text-gray-900"><td colSpan={4} className="p-2">{t('statusConfirmed')} · {t('totals')}</td><td className="p-2 text-right">{formatTk(confirmedTotal, lang, 0)}</td><td></td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
