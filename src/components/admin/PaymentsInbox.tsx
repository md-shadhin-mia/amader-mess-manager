import { useState, type FormEvent } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { usePendingPayments, type PaymentDoc, type PaymentPurpose } from '../../hooks/useMonthEntries';
import type { UserDoc } from '../../hooks/useUsers';
import type { Doc } from '../../hooks/useCollection';
import { todayId, formatDateId } from '../../lib/dates';
import { formatTk, parseAmount } from '../../lib/numbers';
import AmountInput from '../ui/AmountInput';

interface Props {
  users: UserDoc[];
  managerUid: string;
  monthPayments: Doc<PaymentDoc>[];
}

export const PURPOSE_KEYS: Record<PaymentPurpose, 'purposeFund' | 'purposePrepaid' | 'purposeSettlement'> = {
  fund_deposit: 'purposeFund',
  prepaid: 'purposePrepaid',
  settlement: 'purposeSettlement',
};

/**
 * Money handed to the manager. Members record pending payments from their
 * form; here the manager confirms or rejects them, or records one directly.
 */
export default function PaymentsInbox({ users, managerUid, monthPayments }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { pending } = usePendingPayments();
  const [form, setForm] = useState({ user_id: '', purpose: 'fund_deposit' as PaymentPurpose, amount: '', date: todayId(), note: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.name || uid;

  const setStatus = async (payment: Doc<PaymentDoc>, status: 'confirmed' | 'rejected') => {
    setBusy(payment.id);
    try {
      await updateDoc(doc(db, 'payments', payment.id), { status, confirmed_by: managerUid, confirmed_at: serverTimestamp() });
      toast(status === 'confirmed' ? t('paymentConfirmed') : t('paymentRejected'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const record = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.user_id || amount === null || amount <= 0) {
      toast(t('invalidAmount'), { tone: 'error' });
      return;
    }
    setBusy('new');
    try {
      await addDoc(collection(db, 'payments'), {
        date: form.date,
        user_id: form.user_id,
        amount,
        purpose: form.purpose,
        status: 'confirmed',
        note: form.note.trim(),
        recorded_by: managerUid,
        confirmed_by: managerUid,
        confirmed_at: serverTimestamp(),
        timestamp: serverTimestamp(),
      });
      setForm({ ...form, amount: '', note: '' });
      toast(t('paymentRecorded'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const confirmedThisMonth = monthPayments.filter((p) => p.data.status === 'confirmed').sort((a, b) => b.data.date.localeCompare(a.data.date));
  const inputClass = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">{t('payments')}</h2>
        <p className="text-sm text-gray-500">{t('paymentsHint')}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {t('pendingPayments')} {pending.length > 0 && <span className="ml-1 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noPendingPayments')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm text-gray-900 font-medium">
                    {nameOf(p.data.user_id)} · {formatTk(p.data.amount, lang, 0)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t(PURPOSE_KEYS[p.data.purpose] ?? 'purposeFund')} · {formatDateId(p.data.date)} {p.data.note && `· ${p.data.note}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStatus(p, 'confirmed')} disabled={busy === p.id} className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">{t('confirm')}</button>
                  <button onClick={() => setStatus(p, 'rejected')} disabled={busy === p.id} className="text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">{t('reject')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={record} className="bg-gray-50 border border-gray-100 rounded-lg p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div className="col-span-2 md:col-span-6"><h3 className="text-sm font-semibold text-gray-700">{t('recordPayment')}</h3></div>
        <div className="col-span-2 md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">{t('member')}</label>
          <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
            <option value="">—</option>
            {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('purpose')}</label>
          <select className={inputClass} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as PaymentPurpose })}>
            {(Object.keys(PURPOSE_KEYS) as PaymentPurpose[]).map((p) => <option key={p} value={p}>{t(PURPOSE_KEYS[p])}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('date')}</label>
          <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="col-span-2 md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">{t('amountTk')}</label>
          <AmountInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} chips={[500, 1000, 2000]} className="!py-2 !text-sm" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className="block text-xs text-gray-500 mb-1">{t('note')} ({t('optional')})</label>
          <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="col-span-2 md:col-span-2">
          <button type="submit" disabled={busy === 'new'} className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{t('record')}</button>
        </div>
      </form>

      {confirmedThisMonth.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('thisMonthPayments')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="p-2 text-left font-medium">{t('date')}</th>
                  <th className="p-2 text-left font-medium">{t('member')}</th>
                  <th className="p-2 text-left font-medium">{t('purpose')}</th>
                  <th className="p-2 text-right font-medium">{t('amountTk')}</th>
                </tr>
              </thead>
              <tbody>
                {confirmedThisMonth.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="p-2 text-gray-500">{formatDateId(p.data.date)}</td>
                    <td className="p-2 text-gray-900">{nameOf(p.data.user_id)}</td>
                    <td className="p-2 text-gray-500">{t(PURPOSE_KEYS[p.data.purpose] ?? 'purposeFund')}</td>
                    <td className="p-2 text-right text-gray-900 font-medium">{formatTk(p.data.amount, lang, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
