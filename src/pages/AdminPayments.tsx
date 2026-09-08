import { useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useMembers } from '../hooks/useMembers';
import { useActiveMonth } from '../hooks/useMonths';
import { useMonthEntries, usePendingPayments } from '../hooks/useMonthEntries';
import { formatTk } from '../lib/numbers';
import PaymentsInbox from '../components/admin/PaymentsInbox';
import AdminLayout from '../components/admin/AdminLayout';

export default function AdminPayments() {
  const { currentUser } = useAuth();
  const { member: userProfile } = useMess();
  const { t, lang } = useLanguage();
  const { members: users } = useMembers();
  const { activeMonth } = useActiveMonth();
  const entries = useMonthEntries(activeMonth?.id ?? null);
  const { pending } = usePendingPayments();

  const totalConfirmedAmount = useMemo(() => {
    return entries.payments
      .filter((p) => p.data.status === 'confirmed')
      .reduce((sum, p) => sum + (Number(p.data.amount) || 0), 0);
  }, [entries.payments]);

  const totalPendingAmount = useMemo(() => {
    return pending.reduce((sum, p) => sum + (Number(p.data.amount) || 0), 0);
  }, [pending]);

  const totalAdvanceBalances = useMemo(() => {
    return users.reduce((sum, u) => sum + (Number(u.advance_balance) || 0), 0);
  }, [users]);

  const managerUid = userProfile?.uid ?? currentUser?.uid ?? '';

  return (
    <AdminLayout
      activeTab="payments"
      title={t('adminPayments')}
      subtitle={t('paymentsInboxHint')}
    >
      <div className="space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('pendingPayments')}
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {formatTk(totalPendingAmount, lang, 0)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {pending.length} টি পেমেন্ট অপেক্ষমান
              </p>
            </div>
            <div className="w-11 h-11 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-xl flex items-center justify-center font-bold">
              ⏳
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                চলতি মাসের অনুমোদিত জমা
              </p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatTk(totalConfirmedAmount, lang, 0)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {activeMonth ? activeMonth.id : 'চলতি মাস'}
              </p>
            </div>
            <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
              ✓
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                সদস্যদের মোট এডভান্স ব্যালেন্স
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatTk(totalAdvanceBalances, lang, 0)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {users.length} জন সদস্যের মোট
              </p>
            </div>
            <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-xl flex items-center justify-center font-bold">
              ৳
            </div>
          </div>
        </div>

        {/* Payments Inbox Component */}
        {managerUid && (
          <PaymentsInbox
            users={users}
            managerUid={managerUid}
            monthPayments={entries.payments}
          />
        )}
      </div>
    </AdminLayout>
  );
}
