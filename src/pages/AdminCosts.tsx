import { useState } from 'react';
import { Link } from 'react-router-dom';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { useActiveMonth, useMonths } from '../hooks/useMonths';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useMembers } from '../hooks/useMembers';
import { monthIdOf } from '../lib/dates';
import { reopenMonth } from '../lib/closeMonth';
import { messDoc } from '../lib/paths';
import MonthCostsForm from '../components/admin/MonthCostsForm';
import CloseMonthDialog from '../components/admin/CloseMonthDialog';
import AdminLayout from '../components/admin/AdminLayout';

export default function AdminCosts() {
  const { messId: currentMessId, member: userProfile } = useMess();
  const messId = currentMessId ?? '';
  const { t } = useLanguage();
  const { toast } = useToast();

  const { members: users, allMembers } = useMembers();
  const { categories, activeCategories } = useCostCategories();
  const { mealTypes } = useMealTypes();
  const { activeMonth } = useActiveMonth();
  const { months } = useMonths();
  const entries = useMonthEntries(activeMonth?.id ?? null);

  const [showClose, setShowClose] = useState(false);
  const lastClosedMonth = months.find((m) => m.status === 'closed');

  const startNewMonth = async () => {
    const monthId = monthIdOf();
    const existing = months.find((m) => m.id === monthId);
    if (existing?.status === 'closed') return toast(t('monthAlreadyClosed'), { tone: 'error' });
    await setDoc(messDoc(db, messId, 'months', monthId), {
      month_id: monthId,
      status: 'active',
      fixed_costs: lastClosedMonth?.fixed_costs ?? {},
      member_costs: lastClosedMonth?.member_costs ?? {},
      member_weights: {},
      total_meals: 0,
      total_bazar: 0,
      meal_rate: 0,
      timestamp: serverTimestamp(),
    });
    toast(t('monthStarted'));
  };

  const reopen = async () => {
    if (!lastClosedMonth) return;
    if (activeMonth) return toast(t('reopenBlockedActive'), { tone: 'error' });
    if (!confirm(`${t('reopenConfirm')} (${lastClosedMonth.month_id})`)) return;
    try {
      await reopenMonth(db, messId, lastClosedMonth.id, {
        currentMonthId: monthIdOf(),
        hasActiveMonth: Boolean(activeMonth),
        latestClosedMonthId: lastClosedMonth.id,
      });
      toast(t('monthReopened'));
    } catch (err) {
      console.error('Reopen failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  return (
    <AdminLayout
      activeTab="costs"
      title={t('adminCosts')}
      subtitle={t('monthCostsHint')}
      action={
        activeMonth && (
          <div className="flex items-center gap-2">
            <Link
              to={`/admin/months/${activeMonth.id}/edit`}
              className="text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              {t('editEntries')} (লেজার)
            </Link>
            <Link
              to={`/admin/months/${activeMonth.id}`}
              className="text-xs font-semibold bg-slate-900 dark:bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              {t('viewReport')} →
            </Link>
          </div>
        )
      }
    >
      {showClose && activeMonth && userProfile && (
        <CloseMonthDialog
          month={activeMonth}
          users={allMembers}
          categories={categories}
          mealTypes={mealTypes}
          entries={entries}
          closedBy={userProfile.uid}
          onClose={() => setShowClose(false)}
        />
      )}

      <div className="space-y-6">
        {/* Month Status & Controls */}
        <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${activeMonth ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {t('currentMonthStatus')}
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {activeMonth ? (
                <span>
                  চলতি সক্রিয় মাস: <strong className="text-blue-600 dark:text-blue-400 font-mono text-base">{activeMonth.month_id}</strong>
                </span>
              ) : (
                <span className="text-gray-400">{t('noActiveMonth')}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!activeMonth ? (
              <>
                <button
                  onClick={startNewMonth}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-all whitespace-nowrap"
                >
                  + {t('startNewMonth')}
                </button>
                {lastClosedMonth && (
                  <button
                    onClick={reopen}
                    className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all whitespace-nowrap"
                  >
                    {t('reopenMonth')} ({lastClosedMonth.month_id})
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowClose(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-all whitespace-nowrap"
              >
                {t('closeMonth')}
              </button>
            )}
          </div>
        </section>

        {/* Month Costs Form */}
        {activeMonth ? (
          <MonthCostsForm
            month={activeMonth}
            categories={activeCategories}
            users={users}
          />
        ) : (
          <div className="bg-white dark:bg-gray-900 p-12 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            <p className="text-base font-medium">{t('startMonthToEnterCosts')}</p>
            <button
              onClick={startNewMonth}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              এখনই নতুন মাস শুরু করুন
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
