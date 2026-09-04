import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { auth, db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { useActiveMonth, useMonths } from '../hooks/useMonths';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useUsers, type UserDoc } from '../hooks/useUsers';
import { seedCostCategoriesIfEmpty } from '../lib/costCategories';
import { seedMealTypesIfEmpty } from '../lib/mealTypes';
import { monthIdOf } from '../lib/dates';
import { reopenMonth } from '../lib/closeMonth';
import { formatTk, parseAmount } from '../lib/numbers';
import ProfileModal from '../components/ProfileModal';
import NotificationSettings from '../components/NotificationSettings';
import CategoryManager from '../components/admin/CategoryManager';
import MealTypeManager from '../components/admin/MealTypeManager';
import MonthCostsForm from '../components/admin/MonthCostsForm';
import PaymentsInbox from '../components/admin/PaymentsInbox';
import CloseMonthDialog from '../components/admin/CloseMonthDialog';

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { users } = useUsers();
  const { categories, activeCategories } = useCostCategories();
  const { mealTypes } = useMealTypes();
  const { activeMonth } = useActiveMonth();
  const { months } = useMonths();
  const entries = useMonthEntries(activeMonth?.id ?? null);

  const [primaryAdminUid, setPrimaryAdminUid] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rentDrafts, setRentDrafts] = useState<Record<string, string>>({});
  const [savingRentFor, setSavingRentFor] = useState<string | null>(null);

  useEffect(() => {
    void getDoc(doc(db, 'settings', 'app')).then((snapshot) => setPrimaryAdminUid(snapshot.data()?.firstAdminUid ?? null));
    // First manager to open the dashboard seeds the default categories and meal types.
    void seedCostCategoriesIfEmpty(db).catch((err) => console.error('Seeding categories failed', err));
    void seedMealTypesIfEmpty(db).catch((err) => console.error('Seeding meal types failed', err));
  }, []);

  const lastClosedMonth = months.find((m) => m.status === 'closed');

  const makeAdmin = async (member: UserDoc) => {
    if (member.role === 'manager') return;
    if (!confirm(`${member.name} কে অ্যাডমিন বানাতে চান?`)) return;
    try {
      await updateDoc(doc(db, 'users', member.id), { role: 'manager' });
      toast(t('adminMade'));
    } catch (err) {
      console.error('Could not update the member role:', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const removeAdmin = async (member: UserDoc) => {
    if (member.id === primaryAdminUid) return toast(t('primaryAdminProtected'), { tone: 'error' });
    if (users.filter((user) => user.role === 'manager').length <= 1) return toast(t('lastAdminProtected'), { tone: 'error' });
    if (!confirm(`${member.name} কে সাধারণ সদস্য করতে চান?`)) return;
    try {
      await updateDoc(doc(db, 'users', member.id), { role: 'member' });
      toast(t('adminRemoved'));
    } catch (err) {
      console.error('Could not remove the admin role:', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const memberRent = (member: UserDoc) => Math.max(Number(member.room_rent) || 0, 0);
  const rentInputValue = (member: UserDoc) => rentDrafts[member.id] ?? String(memberRent(member));
  const hasRentChange = (member: UserDoc) => member.id in rentDrafts && parseAmount(rentDrafts[member.id]) !== memberRent(member);

  const saveRent = async (member: UserDoc) => {
    const value = parseAmount(rentDrafts[member.id] ?? '');
    if (value === null) return toast(t('invalidRent'), { tone: 'error' });
    setSavingRentFor(member.id);
    try {
      await updateDoc(doc(db, 'users', member.id), { room_rent: value });
      setRentDrafts((drafts) => {
        const next = { ...drafts };
        delete next[member.id];
        return next;
      });
      toast(t('rentUpdated'));
    } catch (err) {
      console.error('Could not update the room rent:', err);
      toast(t('rentUpdateFailed'), { tone: 'error' });
    } finally {
      setSavingRentFor(null);
    }
  };

  const startNewMonth = async () => {
    const monthId = monthIdOf();
    const existing = months.find((m) => m.id === monthId);
    if (existing?.status === 'closed') return toast(t('monthAlreadyClosed'), { tone: 'error' });
    // Carry last month's shared amounts and per-member amounts forward as a starting point.
    await setDoc(doc(db, 'months', monthId), {
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
      await reopenMonth(db, lastClosedMonth.id);
      toast(t('monthReopened'));
    } catch (err) {
      console.error('Reopen failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const totalRoomRent = users.reduce((sum, member) => sum + memberRent(member), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showClose && activeMonth && userProfile && (
        <CloseMonthDialog month={activeMonth} users={users} categories={categories} mealTypes={mealTypes} entries={entries} closedBy={userProfile.uid} onClose={() => setShowClose(false)} />
      )}

      <header className="bg-blue-900 border-b border-blue-950 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10 text-white">
        <div>
          <h1 className="text-xl font-semibold">{t('adminPanel')}</h1>
          <p className="text-blue-200 text-sm">{t('manager')}: {userProfile?.name} {userProfile?.phone && `(${userProfile.phone})`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/months" className="text-sm font-medium bg-blue-800 px-4 py-2 rounded hover:bg-blue-700 transition-colors">{t('monthReports')}</Link>
          <button onClick={() => navigate('/member/entry')} className="text-sm font-medium bg-blue-800 px-4 py-2 rounded hover:bg-blue-700 transition-colors">{t('myMealEntry')}</button>
          <button onClick={() => setShowProfile(true)} className="text-sm font-medium text-blue-200 hover:text-white">{t('editProfile')}</button>
          <div className="bg-blue-950 rounded-lg p-1 flex">
            <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-blue-800 text-white' : 'text-blue-300'}`}>বাংলা</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-blue-800 text-white' : 'text-blue-300'}`}>EN</button>
          </div>
          <button onClick={() => auth.signOut()} className="text-sm font-medium bg-blue-800 px-4 py-2 rounded hover:bg-blue-700 transition-colors">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Month management */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-1">{t('currentMonthStatus')}</h2>
            <p className="text-gray-500 text-sm">{activeMonth ? `${t('active')}: ${activeMonth.month_id}` : t('noActiveMonth')}</p>
            {activeMonth && (
              <Link to={`/admin/months/${activeMonth.id}`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">{t('viewReport')} →</Link>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {!activeMonth ? (
              <>
                <button onClick={startNewMonth} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap">{t('startNewMonth')}</button>
                {lastClosedMonth && (
                  <button onClick={reopen} className="text-sm font-medium text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 whitespace-nowrap">{t('reopenMonth')} ({lastClosedMonth.month_id})</button>
                )}
              </>
            ) : (
              <button onClick={() => setShowClose(true)} className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 whitespace-nowrap">{t('closeMonth')}</button>
            )}
          </div>
        </section>

        {activeMonth ? (
          <MonthCostsForm month={activeMonth} categories={activeCategories} users={users} />
        ) : (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-sm text-gray-500">{t('startMonthToEnterCosts')}</section>
        )}

        {userProfile && <PaymentsInbox users={users} managerUid={userProfile.uid} monthPayments={entries.payments} />}

        {/* Settings: categories and meal types */}
        <section>
          <button onClick={() => setShowSettings((v) => !v)} className="w-full flex justify-between items-center bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 text-left">
            <span>
              <span className="text-lg font-medium text-gray-900">{t('settings')}</span>
              <span className="block text-sm text-gray-500">{t('settingsHint')}</span>
            </span>
            <span className="text-gray-400">{showSettings ? '▲' : '▼'}</span>
          </button>
          {showSettings && (
            <div className="space-y-6 mt-6">
              <CategoryManager categories={categories} />
              <MealTypeManager mealTypes={mealTypes} />
            </div>
          )}
        </section>

        <NotificationSettings />

        {/* Member directory */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-medium text-gray-900">{t('memberDirectory')}</h2>
            <span className="text-sm text-gray-500">{t('totalRoomRent')}: <strong className="text-gray-900">{formatTk(totalRoomRent, lang, 0)}</strong></span>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('rentColumnHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="p-4 font-medium">{t('name')}</th>
                  <th className="p-4 font-medium">{t('phone')}</th>
                  <th className="p-4 font-medium">{t('role')}</th>
                  <th className="p-4 font-medium">{t('roomRent')}</th>
                  <th className="p-4 font-medium">{t('advance')}</th>
                  <th className="p-4 font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="p-4">
                      <div className="text-gray-900 font-medium">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="p-4 text-gray-500">{u.phone || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {u.role === 'manager' ? t('manager') : t('member')}
                      </span>
                    </td>
                    <td className="p-4">
                      <form onSubmit={(e) => { e.preventDefault(); void saveRent(u); }} className="flex items-center gap-2">
                        <input
                          inputMode="decimal"
                          aria-label={`${t('roomRent')}: ${u.name}`}
                          value={rentInputValue(u)}
                          onChange={(e) => setRentDrafts({ ...rentDrafts, [u.id]: e.target.value })}
                          className="w-24 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <span className="text-gray-500 text-sm">৳</span>
                        {hasRentChange(u) && (
                          <button type="submit" disabled={savingRentFor === u.id} className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                            {savingRentFor === u.id ? t('loading') : t('saveRent')}
                          </button>
                        )}
                      </form>
                    </td>
                    <td className="p-4 text-gray-700 font-medium">{formatTk(Number(u.advance_balance) || 0, lang, 0)}</td>
                    <td className="p-4">
                      {u.role !== 'manager' ? (
                        <button onClick={() => makeAdmin(u)} className="text-sm font-medium text-blue-600 hover:text-blue-800">{t('makeAdmin')}</button>
                      ) : u.id !== primaryAdminUid ? (
                        <button onClick={() => removeAdmin(u)} className="text-sm font-medium text-red-600 hover:text-red-800">{t('removeAdmin')}</button>
                      ) : (
                        <span className="text-xs text-gray-400">{t('primaryAdmin')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
