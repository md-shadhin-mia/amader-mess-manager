import { useState, type FormEvent } from 'react';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMess } from '../../contexts/MessContext';
import { messCol } from '../../lib/paths';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { PaymentPurpose } from '../../hooks/useMonthEntries';
import { parseAmount } from '../../lib/numbers';
import AmountInput from '../ui/AmountInput';

interface Props {
  uid: string;
  date: string;
  disabled?: boolean;
}

/** Member records money handed to the manager; it stays pending until confirmed. */
export default function PaymentForm({ uid, date, disabled }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const messId = useMess().messId ?? '';
  const [purpose, setPurpose] = useState<PaymentPurpose>('fund_deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null || value <= 0) return toast(t('invalidAmount'), { tone: 'error' });
    setSaving(true);
    try {
      await addDoc(messCol(db, messId, 'payments'), {
        date,
        user_id: uid,
        amount: value,
        purpose,
        status: 'pending',
        note: note.trim(),
        recorded_by: uid,
        timestamp: serverTimestamp(),
      });
      setAmount('');
      setNote('');
      toast(t('paymentSubmitted'), { tone: 'info' });
    } catch (err) {
      console.error('Payment save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(['fund_deposit', 'prepaid'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPurpose(option)}
            className={`h-11 rounded-lg text-sm font-medium border ${purpose === option ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
          >
            {option === 'fund_deposit' ? t('purposeFund') : t('purposePrepaid')}
          </button>
        ))}
      </div>
      <AmountInput value={amount} onChange={setAmount} chips={[500, 1000, 2000]} placeholder={t('amountTk')} ariaLabel={t('amountTk')} />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`${t('note')} (${t('optional')})`}
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      <button type="submit" disabled={disabled || saving} className="w-full h-12 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? t('loading') : t('submitPayment')}
      </button>
      <p className="text-xs text-gray-400">{t('paymentPendingHint')}</p>
    </form>
  );
}
