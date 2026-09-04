import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useActiveMonth } from '../hooks/useMonths';
import { useMealTypes } from '../hooks/useMealTypes';
import { useMonthEntries, type ExpenseDoc } from '../hooks/useMonthEntries';
import { useItemSuggestions } from '../hooks/useItemSuggestions';
import type { Doc } from '../hooks/useCollection';
import { formatDateId, isInMonth, monthRange, shiftDateId, todayId } from '../lib/dates';
import MealTypeRow from '../components/entry/MealTypeRow';
import BazarForm from '../components/entry/BazarForm';
import PaymentForm from '../components/entry/PaymentForm';
import DayEntries from '../components/entry/DayEntries';

/**
 * Mobile-first member entry page: one-tap meals per type, bazar with amount
 * chips and item autocomplete, deposits, and the day's entries with edit.
 */
export default function MealEntry() {
  const { member: userProfile } = useMess();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { activeMonth } = useActiveMonth();
  const { activeMealTypes } = useMealTypes();
  const entries = useMonthEntries(activeMonth?.id ?? null);
  const suggestions = useItemSuggestions();

  const today = todayId();
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<Doc<ExpenseDoc> | null>(null);
  const [tab, setTab] = useState<'bazar' | 'payment'>('bazar');

  const uid = userProfile?.uid ?? '';
  const monthId = activeMonth?.id ?? null;
  const range = monthId ? monthRange(monthId) : null;
  // Entries may only be made inside the active month and not in the future.
  const dateAllowed = Boolean(monthId && isInMonth(date, monthId) && date <= today);
  const locked = !userProfile || !dateAllowed;

  const canGoBack = Boolean(range && shiftDateId(date, -1) >= range.start);
  const canGoForward = date < today && Boolean(range && shiftDateId(date, 1) <= range.end);

  const mine = useMemo(() => {
    const byMe = <T extends { user_id: string; date: string }>(docs: Doc<T>[]) => docs.filter((d) => d.data.user_id === uid && d.data.date === date);
    return { meals: byMe(entries.meals), expenses: byMe(entries.expenses), payments: byMe(entries.payments) };
  }, [entries, uid, date]);

  const currentMeal = mine.meals.find((m) => m.id === `${uid}_${date}`)?.data ?? mine.meals[0]?.data ?? null;

  const dateLabel = date === today ? t('today') : date === shiftDateId(today, -1) ? t('yesterday') : formatDateId(date, 'EEE, d MMM');

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{t('mealEntryPage')}</h1>
          <p className="text-xs text-gray-500 truncate">{userProfile?.name}</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button onClick={() => navigate(userProfile?.role === 'manager' ? '/admin' : '/member')} className="text-sm font-medium text-blue-600">{t('backDashboard')}</button>
          <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Date stepper */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-2 py-2">
          <button onClick={() => setDate(shiftDateId(date, -1))} disabled={!canGoBack} className="h-10 w-10 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="previous day">‹</button>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{dateLabel}</p>
            <p className="text-xs text-gray-400">{date}</p>
          </div>
          <button onClick={() => setDate(shiftDateId(date, 1))} disabled={!canGoForward} className="h-10 w-10 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="next day">›</button>
        </div>

        {!activeMonth ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4">{t('noActiveMonthEntry')}</div>
        ) : !dateAllowed ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4">{t('dateOutsideMonth')}</div>
        ) : null}

        {/* Meals */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-3">{t('dailyMealEntry')}</h2>
          {activeMealTypes.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noMealTypes')}</p>
          ) : (
            <MealTypeRow uid={uid} date={date} mealTypes={activeMealTypes} current={currentMeal} disabled={locked} />
          )}
        </section>

        {/* Bazar / payment */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1 mb-4">
            <button onClick={() => { setTab('bazar'); }} className={`h-9 rounded-md text-sm font-medium ${tab === 'bazar' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>{t('bazarEntry')}</button>
            <button onClick={() => { setTab('payment'); setEditing(null); }} className={`h-9 rounded-md text-sm font-medium ${tab === 'payment' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>{t('recordDeposit')}</button>
          </div>
          {tab === 'bazar' ? (
            <>
              {editing && <p className="text-xs text-blue-700 mb-2">{t('editing')}: {editing.data.items_description}</p>}
              <BazarForm uid={uid} date={date} suggestions={suggestions} editing={editing} onDone={() => setEditing(null)} disabled={locked} />
            </>
          ) : (
            <PaymentForm uid={uid} date={date} disabled={locked} />
          )}
        </section>

        {/* Day's entries */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-2">{t('dayEntries')} · {dateLabel}</h2>
          <DayEntries
            expenses={mine.expenses}
            payments={mine.payments}
            disabled={locked}
            onEditExpense={(expense) => {
              setTab('bazar');
              setEditing(expense);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </section>

        <p className="text-center text-xs text-gray-400">{lang === 'bn' ? 'সংখ্যা বাংলা বা ইংরেজিতে লিখতে পারেন।' : 'You can type amounts in Bengali or English digits.'}</p>
      </main>
    </div>
  );
}
