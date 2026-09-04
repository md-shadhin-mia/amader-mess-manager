import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useActiveMonth } from '../hooks/useMonths';
import { useMonthSettlement } from '../hooks/useMonthSettlement';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { formatMonthId } from '../lib/dates';
import { formatCount, formatTk } from '../lib/numbers';
import ProfileModal from '../components/ProfileModal';
import NotificationSettings from '../components/NotificationSettings';
import { useState } from 'react';

export default function MemberDashboard() {
  const { member: userProfile, mess } = useMess();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const { activeMonth } = useActiveMonth();
  const { rows, totals } = useMonthSettlement(activeMonth?.id ?? null, { onlyUid: userProfile?.uid });
  const entries = useMonthEntries(activeMonth?.id ?? null);
  const row = rows[0] ?? null;

  const myPayments = entries.payments.filter((p) => p.data.user_id === userProfile?.uid);
  const pendingTotal = myPayments.filter((p) => p.data.status === 'pending').reduce((s, p) => s + p.data.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('memberPanel')}</h1>
          <p className="text-sm text-gray-500">{t('welcome')}, {userProfile?.name} · <Link to="/messes" className="text-blue-600 hover:underline">{mess?.name}</Link></p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('/member/entry')} className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">{t('openEntry')}</button>
          <Link to="/member/months" className="text-sm font-medium text-blue-600 hover:text-blue-700">{t('myMonth')}</Link>
          <button onClick={() => setShowProfile(true)} className="text-sm font-medium text-blue-600 hover:text-blue-700">{t('editProfile')}</button>
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>বাংলা</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>EN</button>
          </div>
          <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 hover:text-red-700">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="bg-blue-600 text-white p-6 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('mealEntryPage')}</h2>
            <p className="text-blue-100 text-sm">{t('entryDescription')}</p>
          </div>
          <button onClick={() => navigate('/member/entry')} className="bg-white text-blue-700 px-5 py-2 rounded-lg font-medium hover:bg-blue-50">{t('openEntry')}</button>
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">{t('thisMonth')} {activeMonth && <span className="text-gray-400 font-normal">· {formatMonthId(activeMonth.id)}</span>}</h2>
            {activeMonth && <Link to={`/member/months/${activeMonth.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">{t('breakdown')} →</Link>}
          </div>
          {!activeMonth ? (
            <p className="text-sm text-gray-500">{t('noActiveMonth')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('totalMeals')}</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCount(row?.meal_count ?? 0, lang)}</p>
                {totals && <p className="text-xs text-gray-400">{t('mealRate')} {formatTk(totals.meal_rate, lang)}</p>}
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('dueNow')}</p>
                <p className={`text-2xl font-semibold ${(row?.due_now ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatTk(row?.due_now ?? 0, lang, 0)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('estimatedAtClose')}</p>
                <p className="text-2xl font-semibold text-gray-900">{formatTk(row?.net_payable ?? 0, lang, 0)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('deposits')}</p>
                <p className="text-2xl font-semibold text-gray-900">{formatTk(row?.credits.deposits ?? 0, lang, 0)}</p>
                {pendingTotal > 0 && <p className="text-xs text-amber-700">{t('statusPending')}: {formatTk(pendingTotal, lang, 0)}</p>}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('ledgerSummary')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('myRoomRent')}</p>
              <p className="text-2xl font-semibold text-gray-900">{typeof userProfile?.room_rent === 'number' ? formatTk(userProfile.room_rent, lang, 0) : t('notSet')}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('advanceBalance')}</p>
              <p className="text-2xl font-semibold text-gray-900">{formatTk(userProfile?.advance_balance ?? 0, lang, 0)}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('personalBazar')}</p>
              <p className="text-2xl font-semibold text-gray-900">{formatTk(row?.credits.personal_bazar ?? 0, lang, 0)}</p>
            </div>
          </div>
        </section>

        <NotificationSettings />
      </main>
    </div>
  );
}
