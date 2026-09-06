import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useMembers } from '../hooks/useMembers';
import { useMonths } from '../hooks/useMonths';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useMonthSettlement } from '../hooks/useMonthSettlement';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { useItemSuggestions } from '../hooks/useItemSuggestions';
import { formatMonthId, monthIdOf } from '../lib/dates';
import { isMonthEditable } from '../lib/monthLogic';
import { MonthCloseError, reopenMonth } from '../lib/closeMonth';
import { formatCount, formatTk } from '../lib/numbers';
import { describeWarning } from '../lib/warnings';
import PageHeader from '../components/PageHeader';
import MonthCostsForm from '../components/admin/MonthCostsForm';
import CloseMonthDialog from '../components/admin/CloseMonthDialog';
import MealsGrid from '../components/ledger/MealsGrid';
import BazarTable from '../components/ledger/BazarTable';
import PaymentsTable from '../components/ledger/PaymentsTable';

type Tab = 'costs' | 'meals' | 'bazar' | 'payments';

/** Manager ledger for one month: costs, meals grid, bazar, payments, and close. */
export default function MonthLedger() {
  const { monthId = '' } = useParams();
  const { currentUser } = useAuth();
  const { messId: currentMessId } = useMess();
  const messId = currentMessId ?? '';
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { months } = useMonths();
  const month = months.find((m) => m.id === monthId) ?? null;
  const { allMembers } = useMembers();
  const { categories, activeCategories } = useCostCategories();
  const { mealTypes, activeMealTypes } = useMealTypes();
  const entries = useMonthEntries(monthId || null);
  const suggestions = useItemSuggestions();
  const { totals } = useMonthSettlement(monthId || null, { applyAdvance: false });

  const [tab, setTab] = useState<Tab>('meals');
  const [showClose, setShowClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = isMonthEditable(month);
  const hasEntries = new Set(entries.meals.map((m) => m.data.user_id));
  // Rows: active members, members who left but carry a weight this month, and anyone with meals already.
  const gridMembers = allMembers.filter((m) => m.status === 'active' || (month?.member_weights?.[m.uid] ?? 0) > 0 || hasEntries.has(m.uid));

  const reopen = async () => {
    if (!month) return;
    if (!confirm(`${t('reopenConfirm')} (${month.month_id})`)) return;
    setBusy(true);
    try {
      const latestClosed = months.find((m) => m.status === 'closed')?.id ?? null;
      await reopenMonth(db, messId, month.id, { currentMonthId: monthIdOf(), hasActiveMonth: months.some((m) => m.status === 'active'), latestClosedMonthId: latestClosed });
      toast(t('monthReopened'));
    } catch (err) {
      console.error('Reopen failed', err);
      toast(err instanceof MonthCloseError && err.code === 'ADVANCE_LOCKED' ? t('reopenLocked') : t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; key: 'tabCosts' | 'tabMeals' | 'tabBazar' | 'tabPayments' }[] = [
    { id: 'meals', key: 'tabMeals' },
    { id: 'bazar', key: 'tabBazar' },
    { id: 'payments', key: 'tabPayments' },
    { id: 'costs', key: 'tabCosts' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {showClose && month && currentUser && (
        <CloseMonthDialog month={month} users={allMembers} categories={categories} mealTypes={mealTypes} entries={entries} closedBy={currentUser.uid} onClose={() => setShowClose(false)} />
      )}
      <PageHeader title={`${t('ledger')} · ${monthId ? formatMonthId(monthId) : ''}`} subtitle={t('ledgerHint')} backTo="/admin/months">
        {month && <Link to={`/admin/months/${month.id}`} className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">{t('viewReport')}</Link>}
        {editable && <button onClick={() => setShowClose(true)} className="text-sm font-medium bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">{t('closeMonth')}</button>}
      </PageHeader>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        {!month && <p className="text-sm text-gray-500 dark:text-gray-400">{t('noMonths')}</p>}

        {month && !editable && (
          <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 text-sm rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{t('closedReadOnly')}</span>
            <button onClick={reopen} disabled={busy} className="text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">{t('reopenMonth')}</button>
          </div>
        )}

        {month && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`px-2 py-1 rounded font-medium ${month.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : month.status === 'backfill' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' : 'bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                {month.status === 'active' ? t('active') : month.status === 'backfill' ? t('backfill') : t('closed')}
              </span>
              {totals && (
                <>
                  <span className="text-gray-600 dark:text-gray-400">{t('totalMeals')}: <strong className="text-gray-900 dark:text-white">{formatCount(totals.total_meals, lang)}</strong></span>
                  <span className="text-gray-600 dark:text-gray-400">{t('totalBazar')}: <strong className="text-gray-900 dark:text-white">{formatTk(totals.total_bazar, lang, 0)}</strong></span>
                  <span className="text-gray-600 dark:text-gray-400">{t('mealRate')}: <strong className="text-gray-900 dark:text-white">{formatTk(totals.meal_rate, lang)}</strong></span>
                  <span className="text-gray-600 dark:text-gray-400">{t('grandCharges')}: <strong className="text-gray-900 dark:text-white">{formatTk(totals.grand.charges, lang, 0)}</strong></span>
                </>
              )}
            </div>

            {totals && totals.warnings.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-medium mb-1">{t('warnings')}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {totals.warnings.map((w) => {
                    const { key, detail } = describeWarning(w);
                    return <li key={w}>{t(key)}{detail ? ` (${allMembers.find((m) => m.uid === detail)?.name || detail})` : ''}</li>;
                  })}
                </ul>
                <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">{t('inactiveCategoryHint')}</p>
              </div>
            )}

            <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-1 w-fit border border-transparent dark:border-gray-800">
              {tabs.map((item) => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === item.id ? 'bg-white dark:bg-gray-800 shadow text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {t(item.key)}
                </button>
              ))}
            </div>

            <section className="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
              {tab === 'costs' && <MonthCostsForm month={month} categories={activeCategories} users={allMembers.filter((m) => m.status === 'active' || (month.member_weights?.[m.uid] ?? 0) > 0)} />}
              {tab === 'meals' && <MealsGrid messId={messId} monthId={month.id} members={gridMembers} mealTypes={activeMealTypes} meals={entries.meals} disabled={!editable} />}
              {tab === 'bazar' && <BazarTable messId={messId} monthId={month.id} members={gridMembers} expenses={entries.expenses} suggestions={suggestions} disabled={!editable} />}
              {tab === 'payments' && currentUser && <PaymentsTable messId={messId} monthId={month.id} members={gridMembers} payments={entries.payments} managerUid={currentUser.uid} disabled={!editable} />}
            </section>
          </>
        )}

        {month && editable && (
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('ledgerCloseHint')} <button onClick={() => navigate(`/admin/months/${month.id}`)} className="text-blue-600 dark:text-blue-400 underline">{t('viewReport')}</button></p>
        )}
      </main>
    </div>
  );
}
