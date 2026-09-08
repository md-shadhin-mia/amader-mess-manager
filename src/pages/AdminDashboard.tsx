import { useState } from 'react';
import { Link } from 'react-router-dom';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useMess } from '../contexts/MessContext';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { useActiveMonth, useMonths } from '../hooks/useMonths';
import { useMonthEntries, usePendingPayments } from '../hooks/useMonthEntries';
import { useMembers } from '../hooks/useMembers';
import { monthIdOf } from '../lib/dates';
import { reopenMonth } from '../lib/closeMonth';
import { messDoc } from '../lib/paths';
import { formatCount, formatTk } from '../lib/numbers';
import CloseMonthDialog from '../components/admin/CloseMonthDialog';
import AdminLayout from '../components/admin/AdminLayout';
import NoticeBoardWidget from '../components/NoticeBoardWidget';

export default function AdminDashboard() {
  const { messId: currentMessId, mess, member: userProfile } = useMess();
  const messId = currentMessId ?? '';
  const { t, lang } = useLanguage();
  const { toast } = useToast();

  const { members: users, allMembers } = useMembers();
  const { categories } = useCostCategories();
  const { mealTypes } = useMealTypes();
  const { activeMonth } = useActiveMonth();
  const { months } = useMonths();
  const entries = useMonthEntries(activeMonth?.id ?? null);
  const { pending } = usePendingPayments();

  const [showClose, setShowClose] = useState(false);
  const lastClosedMonth = months.find((m) => m.status === 'closed');

  const totalRoomRent = users.reduce(
    (sum, m) => sum + Math.max(Number(m.room_rent) || 0, 0),
    0
  );

  const totalBazarThisMonth = entries.expenses.reduce(
    (sum, e) => sum + (Number(e.data.amount_spent) || 0),
    0
  );

  const totalMealsThisMonth = entries.meals.reduce(
    (sum, m) => sum + (Number(m.data.meal_count) || 0),
    0
  );

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

  const copyCode = async () => {
    if (!mess?.join_code) return;
    try {
      await navigator.clipboard.writeText(mess.join_code);
      toast(t('codeCopied'));
    } catch {
      toast(mess.join_code, { tone: 'info', durationMs: 8000 });
    }
  };

  return (
    <AdminLayout activeTab="overview">
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

      <div className="space-y-8">
        <NoticeBoardWidget />

        {/* Welcome and KPI Snapshot */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Month */}
          <Link
            to="/admin/costs"
            className="group bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between"
          >
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('currentMonthStatus')}
              </span>
              <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 mt-1 font-mono group-hover:text-blue-600 transition-colors">
                {activeMonth ? activeMonth.month_id : 'সক্রিয় নেই'}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-blue-600 dark:text-blue-400 font-medium">
              <span>{activeMonth ? 'খরচ ও স্ট্যাটাস' : 'মাস শুরু করুন'}</span>
              <span>→</span>
            </div>
          </Link>

          {/* Members */}
          <Link
            to="/admin/members"
            className="group bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between"
          >
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('activeMembers')}
              </span>
              <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 mt-1 font-mono group-hover:text-blue-600 transition-colors">
                {users.length} <span className="text-xs font-normal text-gray-400">/ {mess?.member_limit ?? 0}</span>
              </p>
            </div>
            <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-blue-600 dark:text-blue-400 font-medium">
              <span>সদস্য তালিকা</span>
              <span>→</span>
            </div>
          </Link>

          {/* Pending Payments */}
          <Link
            to="/admin/payments"
            className={`group bg-white dark:bg-gray-900 p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between ${
              pending.length > 0
                ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20'
                : 'border-gray-200 dark:border-gray-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('pendingPayments')}
                </span>
                {pending.length > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    নতুন
                  </span>
                )}
              </div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 mt-1 font-mono group-hover:text-amber-600 transition-colors">
                {pending.length} <span className="text-xs font-normal text-gray-400">টি</span>
              </p>
            </div>
            <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-amber-600 dark:text-amber-400 font-medium">
              <span>অনুমোদন দিন</span>
              <span>→</span>
            </div>
          </Link>

          {/* Total Room Rent */}
          <Link
            to="/admin/members"
            className="group bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between"
          >
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('totalRoomRent')}
              </span>
              <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 mt-1 font-mono group-hover:text-blue-600 transition-colors">
                {formatTk(totalRoomRent, lang, 0)}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-blue-600 dark:text-blue-400 font-medium">
              <span>রুম ভাড়া নির্ধারণ</span>
              <span>→</span>
            </div>
          </Link>
        </div>

        {/* Action Workspaces Section (Separate Pages for Separate Work) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                কাজের বিভাগসমূহ (Workspaces)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                নির্দিষ্ট কাজের জন্য নিচের আলাদা পেজগুলো ব্যবহার করুন
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. Members & Rent */}
            <Link
              to="/admin/members"
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                  👥
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 transition-colors">
                  {t('adminMembers')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  সদস্যদের তালিকা, প্রত্যেকের নির্দিষ্ট রুম ভাড়া ইনপুট, ম্যানেজার রোল তৈরি, সদস্য যোগ বা বাতিল।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>সদস্য পেজে যান</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>

            {/* 2. Payments Inbox */}
            <Link
              to="/admin/payments"
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-amber-400 dark:hover:border-amber-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform relative">
                  💰
                  {pending.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pending.length}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-amber-600 transition-colors">
                  {t('adminPayments')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  সদস্যদের পাঠানো ডিপোজিট ও ব্যালেন্স যাচাই, অনুমোদন বা বাতিল, সরাসরি ম্যানেজার রিসিট এন্ট্রি।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>পেমেন্ট পেজে যান</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>

            {/* 3. Monthly Costs & Bills */}
            <Link
              to="/admin/costs"
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                  📋
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 transition-colors">
                  {t('adminCosts')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  চলতি মাসের বুয়ার বিল, গ্যাস, কারেন্ট, ওয়াইফাই এবং সদস্যভিত্তিক বিশেষ চার্জ নির্ধারণ ও মাস ক্লোজিং।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span>খরচ পেজে যান</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>

            {/* 4. Month Ledger & Matrix */}
            <Link
              to={activeMonth ? `/admin/months/${activeMonth.id}/edit` : '/admin/months'}
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                  📊
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors">
                  {t('ledger')} (মাসের লেজার)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  পুরো মাসের সকল মিল, বাজার ও ডিপোজিটের স্প্রেডশিট ভিউ। সরাসরি ঘরে ঘরে কারেকশন বা এক ক্লিকের পরিবর্তন।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <span>লেজার ওপেন করুন</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>

            {/* 5. Mess & Meal Settings */}
            <Link
              to="/admin/settings"
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-purple-400 dark:hover:border-purple-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                  ⚙️
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-purple-600 transition-colors">
                  {t('adminSettings')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  মেসের নাম, টাইমজোন, খরচের ক্যাটাগরি তৈরি, মিলের অনুপাত (Breakfast/Lunch/Dinner) ও পুশ নোটিফিকেশন।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-purple-600 dark:text-purple-400">
                <span>সেটিংস পেজে যান</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>

            {/* 6. Reports & Archive */}
            <Link
              to="/admin/months"
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-teal-400 dark:hover:border-teal-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                  📁
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-teal-600 transition-colors">
                  {t('monthReports')} ও আর্কাইভ
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  পূর্ববর্তী সকল মাসের হিসাব নিকাশ, ফাইনাল মিল রেট, সদস্যভিত্তিক জমার বিবরণ ও বাৎসরিক সারাংশ।
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-semibold text-teal-600 dark:text-teal-400">
                <span>রিপোর্টগুলো দেখুন</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Active Month Quick Status Bar */}
        <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${activeMonth ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t('currentMonthStatus')}
              </span>
            </div>
            {activeMonth ? (
              <div>
                <h3 className="text-xl font-bold font-mono text-white">
                  মাস: {activeMonth.month_id}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  মোট মিল: {formatCount(totalMealsThisMonth, lang)} · মোট বাজার: {formatTk(totalBazarThisMonth, lang, 0)}
                </p>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-bold text-white">{t('noActiveMonth')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">দৈনিক মিল ও বাজার রেকর্ড করতে নতুন মাস চালু করুন</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeMonth ? (
              <>
                <Link
                  to={`/admin/months/${activeMonth.id}/edit`}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition-colors"
                >
                  {t('editEntries')} (লেজার)
                </Link>
                <Link
                  to={`/admin/months/${activeMonth.id}`}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  {t('viewReport')}
                </Link>
                <button
                  onClick={() => setShowClose(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  {t('closeMonth')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startNewMonth}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-colors"
                >
                  + {t('startNewMonth')}
                </button>
                {lastClosedMonth && (
                  <button
                    onClick={reopen}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition-colors"
                  >
                    {t('reopenMonth')} ({lastClosedMonth.month_id})
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Mess Join Quick Banner */}
        {mess && (
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                মেসে নতুন সদস্য যুক্ত করার কোড
              </p>
              <p className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {mess.join_code}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyCode}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {t('copyCode')}
              </button>
              <Link
                to="/admin/members"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                যোগদানের পূর্ণ বিবরণ →
              </Link>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
