import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { auth, db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useMess } from '../contexts/MessContext';
import ThemeToggle from '../components/ThemeToggle';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { useActiveMonth, useMonths } from '../hooks/useMonths';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useMembers, type MemberDoc } from '../hooks/useMembers';
import { monthIdOf } from '../lib/dates';
import { reopenMonth } from '../lib/closeMonth';
import { removeMember, renameMess, rotateJoinCode } from '../lib/mess';
import { memberRef, messDoc } from '../lib/paths';
import { formatTk, parseAmount } from '../lib/numbers';
import ProfileModal from '../components/ProfileModal';
import NotificationSettings from '../components/NotificationSettings';
import CategoryManager from '../components/admin/CategoryManager';
import MealTypeManager from '../components/admin/MealTypeManager';
import MonthCostsForm from '../components/admin/MonthCostsForm';
import PaymentsInbox from '../components/admin/PaymentsInbox';
import CloseMonthDialog from '../components/admin/CloseMonthDialog';
import Avatar from '../components/Avatar';

export default function AdminDashboard() {
  const { currentUser, isSuperAdmin } = useAuth();
  const { messId: currentMessId, mess, member: userProfile } = useMess();
  const messId = currentMessId ?? '';
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { members: users, allMembers } = useMembers();
  const { categories, activeCategories } = useCostCategories();
  const { mealTypes } = useMealTypes();
  const { activeMonth } = useActiveMonth();
  const { months } = useMonths();
  const entries = useMonthEntries(activeMonth?.id ?? null);

  const ownerUid = mess?.owner_uid ?? null;
  const [showProfile, setShowProfile] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rentDrafts, setRentDrafts] = useState<Record<string, string>>({});
  const [savingRentFor, setSavingRentFor] = useState<string | null>(null);
  const [messName, setMessName] = useState<string | null>(null);
  const [messTz, setMessTz] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const lastClosedMonth = months.find((m) => m.status === 'closed');

  const makeAdmin = async (member: MemberDoc) => {
    if (member.role === 'manager') return;
    if (!confirm(`${member.name} কে অ্যাডমিন বানাতে চান?`)) return;
    try {
      await updateDoc(memberRef(db, messId, member.id), { role: 'manager' });
      toast(t('adminMade'));
    } catch (err) {
      console.error('Could not update the member role:', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const removeAdmin = async (member: MemberDoc) => {
    if (member.id === ownerUid) return toast(t('primaryAdminProtected'), { tone: 'error' });
    if (users.filter((user) => user.role === 'manager').length <= 1) return toast(t('lastAdminProtected'), { tone: 'error' });
    if (!confirm(`${member.name} কে সাধারণ সদস্য করতে চান?`)) return;
    try {
      await updateDoc(memberRef(db, messId, member.id), { role: 'member' });
      toast(t('adminRemoved'));
    } catch (err) {
      console.error('Could not remove the admin role:', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const kick = async (member: MemberDoc) => {
    if (member.id === ownerUid) return toast(t('primaryAdminProtected'), { tone: 'error' });
    if (!confirm(`${t('removeMemberConfirm')} (${member.name})`)) return;
    try {
      await removeMember(db, messId, member.id);
      toast(t('memberRemoved'));
    } catch (err) {
      console.error('Could not remove the member:', err);
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

  const copyLink = async () => {
    if (!mess?.join_code) return;
    const link = `${window.location.origin}/join/${mess.join_code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(t('linkCopied'));
    } catch {
      toast(link, { tone: 'info', durationMs: 8000 });
    }
  };

  const rotate = async () => {
    if (!mess || !currentUser) return;
    if (!confirm(t('rotateConfirm'))) return;
    setBusy('rotate');
    try {
      await rotateJoinCode(db, mess, currentUser.uid);
      toast(t('codeRotated'));
    } catch (err) {
      console.error('Rotate code failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveMess = async (e: FormEvent) => {
    e.preventDefault();
    if (!mess) return;
    setBusy('mess');
    try {
      await renameMess(db, mess.id, messName ?? mess.name, messTz ?? mess.timezone);
      setMessName(null);
      setMessTz(null);
      toast(t('saved'));
    } catch (err) {
      console.error('Rename mess failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const memberRent = (member: MemberDoc) => Math.max(Number(member.room_rent) || 0, 0);
  const rentInputValue = (member: MemberDoc) => rentDrafts[member.id] ?? String(memberRent(member));
  const hasRentChange = (member: MemberDoc) => member.id in rentDrafts && parseAmount(rentDrafts[member.id]) !== memberRent(member);

  const saveRent = async (member: MemberDoc) => {
    const value = parseAmount(rentDrafts[member.id] ?? '');
    if (value === null) return toast(t('invalidRent'), { tone: 'error' });
    setSavingRentFor(member.id);
    try {
      await updateDoc(memberRef(db, messId, member.id), { room_rent: value });
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
      await reopenMonth(db, messId, lastClosedMonth.id, { currentMonthId: monthIdOf(), hasActiveMonth: Boolean(activeMonth), latestClosedMonthId: lastClosedMonth.id });
      toast(t('monthReopened'));
    } catch (err) {
      console.error('Reopen failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    }
  };

  const totalRoomRent = users.reduce((sum, member) => sum + memberRent(member), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-12 transition-colors">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showClose && activeMonth && userProfile && (
        <CloseMonthDialog month={activeMonth} users={allMembers} categories={categories} mealTypes={mealTypes} entries={entries} closedBy={userProfile.uid} onClose={() => setShowClose(false)} />
      )}

      <header className="bg-blue-900 dark:bg-gray-900 border-b border-blue-950 dark:border-gray-800 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10 text-white transition-colors">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProfile(true)}
            className="hover:opacity-80 transition-opacity focus:outline-none"
            title={t('editProfile')}
          >
            <Avatar name={userProfile?.name} photoUrl={userProfile?.photo_url} size="md" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">{mess?.name ?? t('adminPanel')}</h1>
            <p className="text-blue-200 dark:text-gray-400 text-sm">
              {t('manager')}: {userProfile?.name} {userProfile?.phone && `(${userProfile.phone})`}
              {' · '}
              <Link to="/messes" className="underline hover:text-white">{t('switchMess')}</Link>
              {isSuperAdmin && <> · <Link to="/super" className="underline hover:text-white">{t('superAdmin')}</Link></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/months" className="text-sm font-medium bg-blue-800 dark:bg-gray-800 px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors">{t('monthReports')}</Link>
          <Link to="/admin/reports" className="text-sm font-medium bg-blue-800 dark:bg-gray-800 px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors">{t('yearOverview')}</Link>
          <button onClick={() => navigate('/member/entry')} className="text-sm font-medium bg-blue-800 dark:bg-gray-800 px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors">{t('myMealEntry')}</button>
          <button onClick={() => setShowProfile(true)} className="text-sm font-medium text-blue-200 dark:text-gray-300 hover:text-white">{t('editProfile')}</button>
          <ThemeToggle className="text-blue-200 dark:text-gray-300 hover:text-white hover:bg-blue-800 dark:hover:bg-gray-800" />
          <div className="bg-blue-950 dark:bg-gray-800 rounded-lg p-1 flex">
            <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${lang === 'bn' ? 'bg-blue-800 dark:bg-gray-700 text-white' : 'text-blue-300 dark:text-gray-400'}`}>বাংলা</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${lang === 'en' ? 'bg-blue-800 dark:bg-gray-700 text-white' : 'text-blue-300 dark:text-gray-400'}`}>EN</button>
          </div>
          <button onClick={() => auth.signOut()} className="text-sm font-medium bg-blue-800 dark:bg-gray-800 px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Month management */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">{t('currentMonthStatus')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{activeMonth ? `${t('active')}: ${activeMonth.month_id}` : t('noActiveMonth')}</p>
            {activeMonth && (
              <span className="text-sm font-medium">
                <Link to={`/admin/months/${activeMonth.id}/edit`} className="text-blue-600 dark:text-blue-400 hover:underline">{t('editEntries')}</Link>
                {' · '}
                <Link to={`/admin/months/${activeMonth.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{t('viewReport')} →</Link>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {!activeMonth ? (
              <>
                <button onClick={startNewMonth} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap">{t('startNewMonth')}</button>
                {lastClosedMonth && (
                  <button onClick={reopen} className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap">{t('reopenMonth')} ({lastClosedMonth.month_id})</button>
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
          <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">{t('startMonthToEnterCosts')}</section>
        )}

        {userProfile && <PaymentsInbox users={users} managerUid={userProfile.uid} monthPayments={entries.payments} />}

        {/* Mess settings: name, timezone, join code, seats */}
        {mess && (
          <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('messSettings')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('messSettingsHint')}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2 py-1 rounded text-xs font-medium ${mess.plan === 'pro' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{mess.plan === 'pro' ? t('planPro') : t('planFree')}</span>
                <span className="text-gray-600 dark:text-gray-400">{t('seats')}: <strong className="text-gray-900 dark:text-gray-100">{mess.member_count} / {mess.member_limit}</strong></span>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <form onSubmit={saveMess} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('messName')}</label>
                  <input value={messName ?? mess.name} onChange={(e) => setMessName(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg text-sm" required maxLength={60} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('timezone')}</label>
                  <input value={messTz ?? mess.timezone} onChange={(e) => setMessTz(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg text-sm" />
                </div>
                {(messName !== null && messName !== mess.name) || (messTz !== null && messTz !== mess.timezone) ? (
                  <button type="submit" disabled={busy === 'mess'} className="text-sm font-medium bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">{t('saveMess')}</button>
                ) : null}
              </form>
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-xs text-blue-900 dark:text-blue-300 mb-1">{t('joinCode')}</p>
                    <p className="font-mono text-2xl tracking-widest text-blue-900 dark:text-blue-200">{mess.join_code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={copyLink} className="text-sm font-medium bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {t('copyLink')}
                    </button>
                    <button onClick={copyCode} className="text-sm font-medium bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700">
                      {t('copyCode')}
                    </button>
                    <button onClick={rotate} disabled={busy === 'rotate'} className="text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">
                      {t('rotateCode')}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-300/80">{t('joinCodeHint')}</p>
              </div>
            </div>
          </section>
        )}

        {/* Settings: categories and meal types */}
        <section>
          <button onClick={() => setShowSettings((v) => !v)} className="w-full flex justify-between items-center bg-white dark:bg-gray-800 px-6 py-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-left transition-colors">
            <span>
              <span className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('settings')}</span>
              <span className="block text-sm text-gray-500 dark:text-gray-400">{t('settingsHint')}</span>
            </span>
            <span className="text-gray-400 dark:text-gray-500">{showSettings ? '▲' : '▼'}</span>
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
        <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('memberDirectory')}</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('totalRoomRent')}: <strong className="text-gray-900 dark:text-gray-100">{formatTk(totalRoomRent, lang, 0)}</strong></span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('rentColumnHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-sm border-b border-gray-200 dark:border-gray-700">
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
                  <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} photoUrl={u.photo_url} size="sm" />
                        <div>
                          <div className="text-gray-900 dark:text-gray-100 font-medium">{u.name}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400">{u.phone || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === 'manager' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
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
                          className="w-24 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <span className="text-gray-500 dark:text-gray-400 text-sm">৳</span>
                        {hasRentChange(u) && (
                          <button type="submit" disabled={savingRentFor === u.id} className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                            {savingRentFor === u.id ? t('loading') : t('saveRent')}
                          </button>
                        )}
                      </form>
                    </td>
                    <td className="p-4 text-gray-700 dark:text-gray-300 font-medium">{formatTk(Number(u.advance_balance) || 0, lang, 0)}</td>
                    <td className="p-4 whitespace-nowrap">
                      {u.id === ownerUid ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t('primaryAdmin')}</span>
                      ) : (
                        <>
                          {u.role !== 'manager' ? (
                            <button onClick={() => makeAdmin(u)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mr-3">{t('makeAdmin')}</button>
                          ) : (
                            <button onClick={() => removeAdmin(u)} className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline mr-3">{t('removeAdmin')}</button>
                          )}
                          <button onClick={() => kick(u)} className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-400">{t('removeMember')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allMembers.some((m) => m.status === 'left') && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                {t('leftMembers')}: {allMembers.filter((m) => m.status === 'left').map((m) => m.name).join(', ')}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
