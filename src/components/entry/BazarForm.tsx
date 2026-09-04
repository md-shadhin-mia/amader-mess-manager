import { useEffect, useState, type FormEvent } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { Doc } from '../../hooks/useCollection';
import type { ExpenseDoc } from '../../hooks/useMonthEntries';
import { parseAmount } from '../../lib/numbers';
import AmountInput from '../ui/AmountInput';

interface Props {
  uid: string;
  date: string;
  suggestions: string[];
  editing?: Doc<ExpenseDoc> | null;
  onDone?: () => void;
  disabled?: boolean;
}

/** Bazar expense entry with amount chips and item-name autocomplete. */
export default function BazarForm({ uid, date, suggestions, editing, onDone, disabled }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [items, setItems] = useState('');
  const [type, setType] = useState<'personal' | 'from_fund'>('personal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setAmount(String(editing.data.amount_spent));
      setItems(editing.data.items_description || '');
      setType(editing.data.expense_type);
    } else {
      setAmount('');
      setItems('');
      setType('personal');
    }
  }, [editing]);

  // Autocomplete the last comma-separated item being typed.
  const lastTerm = items.split(',').pop()?.trim().toLowerCase() || '';
  const matches = lastTerm.length > 0 ? suggestions.filter((s) => s.toLowerCase().includes(lastTerm) && s.toLowerCase() !== lastTerm).slice(0, 6) : suggestions.slice(0, 6);
  const applySuggestion = (s: string) => {
    const parts = items.split(',');
    parts[parts.length - 1] = ` ${s}`;
    setItems(parts.join(',').replace(/^\s+/, ''));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null || value <= 0) return toast(t('invalidAmount'), { tone: 'error' });
    if (!items.trim()) return toast(t('itemsRequired'), { tone: 'error' });
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'bazar_expenses', editing.id), { amount_spent: value, items_description: items.trim(), expense_type: type, updated_at: serverTimestamp() });
        toast(t('bazarUpdated'));
      } else {
        await addDoc(collection(db, 'bazar_expenses'), {
          date,
          user_id: uid,
          amount_spent: value,
          items_description: items.trim(),
          expense_type: type,
          timestamp: serverTimestamp(),
        });
        toast(t('bazarAdded'));
      }
      setAmount('');
      setItems('');
      onDone?.();
    } catch (err) {
      console.error('Bazar save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(['personal', 'from_fund'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={`h-11 rounded-lg text-sm font-medium border ${type === option ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
          >
            {option === 'personal' ? t('personalMoney') : t('fromFund')}
          </button>
        ))}
      </div>

      <AmountInput value={amount} onChange={setAmount} chips={[100, 200, 500, 1000]} placeholder={t('amountTk')} ariaLabel={t('amountTk')} />

      <div>
        <input
          list="bazar-items"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={t('itemsDesc')}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <datalist id="bazar-items">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        {matches.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {matches.map((s) => (
              <button key={s} type="button" onClick={() => applySuggestion(s)} className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-800">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={disabled || saving} className="flex-1 h-12 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
          {saving ? t('loading') : editing ? t('update') : t('addExpense')}
        </button>
        {editing && (
          <button type="button" onClick={onDone} className="h-12 px-4 rounded-lg text-sm font-medium text-gray-600 border border-gray-200">
            {t('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
