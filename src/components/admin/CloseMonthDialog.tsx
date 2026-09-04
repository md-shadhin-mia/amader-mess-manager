import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { MonthDoc } from '../../hooks/useMonths';
import type { MonthEntries } from '../../hooks/useMonthEntries';
import type { MemberDoc } from '../../hooks/useMembers';
import { useMess } from '../../contexts/MessContext';
import type { CostCategory } from '../../lib/costCategories';
import type { MealType } from '../../lib/mealTypes';
import { BLOCKING_WARNINGS, buildSettlementInput, closeMonth, MonthCloseError } from '../../lib/closeMonth';
import { computeSettlement } from '../../lib/settlement';
import { formatTk, formatCount } from '../../lib/numbers';
import { describeWarning } from '../../lib/warnings';

interface Props {
  month: MonthDoc;
  users: MemberDoc[];
  categories: CostCategory[];
  mealTypes: MealType[];
  entries: MonthEntries;
  closedBy: string;
  onClose: () => void;
}

/** Preview of the settlement computed from live data, with the final "close" action. */
export default function CloseMonthDialog({ month, users, categories, mealTypes, entries, closedBy, onClose }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { messId } = useMess();
  const navigate = useNavigate();
  const [applyAdvance, setApplyAdvance] = useState(true);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () =>
      computeSettlement(
        buildSettlementInput({
          month,
          users,
          categories,
          mealTypes,
          entries: { meals: entries.meals.map((d) => d.data), expenses: entries.expenses.map((d) => d.data), payments: entries.payments.map((d) => d.data) },
          applyAdvance,
        }),
      ),
    [month, users, categories, mealTypes, entries, applyAdvance],
  );
  const blocking = preview.warnings.filter((w) => BLOCKING_WARNINGS.includes(w));

  const confirmClose = async () => {
    setBusy(true);
    try {
      if (!messId) return;
      await closeMonth(db, { messId, monthId: month.id, users, categories, mealTypes, applyAdvance, closedBy });
      toast(t('monthClosed'));
      onClose();
      navigate(`/admin/months/${month.id}`);
    } catch (err) {
      console.error('Close month failed', err);
      toast(err instanceof MonthCloseError ? t('blockedByWarnings') : t('closeFailed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">{t('closeMonthTitle')} · {month.month_id}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">{t('close')}</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">{t('closeMonthPreview')}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('totalMeals')}</dt><dd className="text-lg font-semibold text-gray-900">{formatCount(preview.total_meals, lang)}</dd></div>
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('mealRate')}</dt><dd className="text-lg font-semibold text-gray-900">{formatTk(preview.meal_rate, lang)}</dd></div>
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('totalBazar')}</dt><dd className="text-lg font-semibold text-gray-900">{formatTk(preview.total_bazar, lang, 0)}</dd></div>
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('fundCashOnHand')}</dt><dd className={`text-lg font-semibold ${preview.fund_cash_on_hand < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatTk(preview.fund_cash_on_hand, lang, 0)}</dd></div>
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('grandCharges')}</dt><dd className="text-lg font-semibold text-gray-900">{formatTk(preview.grand.charges, lang, 0)}</dd></div>
            <div className="bg-gray-50 rounded-lg p-3"><dt className="text-gray-500">{t('grandNet')}</dt><dd className="text-lg font-semibold text-gray-900">{formatTk(preview.grand.net_payable, lang, 0)}</dd></div>
          </dl>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={applyAdvance} onChange={(e) => setApplyAdvance(e.target.checked)} className="mt-1" />
            <span>
              <span className="font-medium text-gray-800">{t('applyAdvance')}</span>
              <span className="block text-gray-500">{t('applyAdvanceHint')}</span>
            </span>
          </label>

          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-900 mb-1">{t('warnings')}</p>
              <ul className="list-disc pl-5 text-amber-800 space-y-0.5">
                {preview.warnings.map((w) => {
                  const { key, detail } = describeWarning(w);
                  return <li key={w}>{t(key)}{detail ? ` (${users.find((u) => u.uid === detail)?.name || detail})` : ''}</li>;
                })}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">{t('cancel')}</button>
            <button
              onClick={confirmClose}
              disabled={busy || blocking.length > 0}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? t('closing') : t('confirmClose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
