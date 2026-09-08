import { useState, useMemo } from 'react';
import { updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useMembers, type MemberDoc } from '../hooks/useMembers';
import { memberRef } from '../lib/paths';
import { removeMember, rotateJoinCode } from '../lib/mess';
import { formatTk, parseAmount } from '../lib/numbers';
import Avatar from '../components/Avatar';
import AdminLayout from '../components/admin/AdminLayout';

export default function AdminMembers() {
  const { currentUser } = useAuth();
  const { messId: currentMessId, mess } = useMess();
  const messId = currentMessId ?? '';
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { members: users, allMembers } = useMembers();

  const ownerUid = mess?.owner_uid ?? null;
  const [searchQuery, setSearchQuery] = useState('');
  const [rentDrafts, setRentDrafts] = useState<Record<string, string>>({});
  const [savingRentFor, setSavingRentFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const memberRent = (member: MemberDoc) => Math.max(Number(member.room_rent) || 0, 0);
  const rentInputValue = (member: MemberDoc) => rentDrafts[member.id] ?? String(memberRent(member));
  const hasRentChange = (member: MemberDoc) =>
    member.id in rentDrafts && parseAmount(rentDrafts[member.id]) !== memberRent(member);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const totalRoomRent = useMemo(
    () => users.reduce((sum, member) => sum + memberRent(member), 0),
    [users]
  );

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
    if (users.filter((user) => user.role === 'manager').length <= 1) {
      return toast(t('lastAdminProtected'), { tone: 'error' });
    }
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

  return (
    <AdminLayout
      activeTab="members"
      title={t('adminMembers')}
      subtitle={t('manageMembersHint')}
      action={
        <div className="text-sm bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 px-3 py-1.5 rounded-lg font-medium">
          {t('totalRoomRent')}: <strong>{formatTk(totalRoomRent, lang, 0)}</strong>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Join Code & Seats Card */}
        {mess && (
          <section className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-blue-800/40 relative overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                    {t('joinLink')}
                  </span>
                  <span className="text-xs bg-blue-800/80 px-2 py-0.5 rounded text-blue-200">
                    {mess.member_count} / {mess.member_limit} {t('seatsOccupied')}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <p className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-white">
                    {mess.join_code}
                  </p>
                </div>
                <p className="text-xs text-blue-200/80 mt-1 max-w-md">
                  {t('joinCodeHint')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={copyLink}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {t('copyLink')}
                </button>
                <button
                  onClick={copyCode}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-4 py-2.5 rounded-xl border border-white/20 backdrop-blur-xs transition-all"
                >
                  {t('copyCode')}
                </button>
                <button
                  onClick={rotate}
                  disabled={busy === 'rotate'}
                  className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium px-3 py-2.5 rounded-xl border border-rose-400/30 disabled:opacity-50 transition-all"
                >
                  {t('rotateCode')}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Member Directory Table */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
          <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder={t('searchMember')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 sm:top-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {filteredUsers.length} / {users.length} {t('activeMembers')}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
                  <th className="py-3 px-4 sm:px-6">{t('name')}</th>
                  <th className="py-3 px-4">{t('phone')}</th>
                  <th className="py-3 px-4">{t('role')}</th>
                  <th className="py-3 px-4">{t('roomRent')}</th>
                  <th className="py-3 px-4">{t('advance')}</th>
                  <th className="py-3 px-4 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      কোনো সদস্য পাওয়া যায়নি
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} photoUrl={u.photo_url} size="sm" />
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {u.name}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === 'manager'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {u.role === 'manager' ? t('manager') : t('member')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveRent(u);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            inputMode="decimal"
                            aria-label={`${t('roomRent')}: ${u.name}`}
                            value={rentInputValue(u)}
                            onChange={(e) =>
                              setRentDrafts({ ...rentDrafts, [u.id]: e.target.value })
                            }
                            className="w-20 sm:w-24 px-2.5 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                          <span className="text-xs text-gray-500">৳</span>
                          {hasRentChange(u) && (
                            <button
                              type="submit"
                              disabled={savingRentFor === u.id}
                              className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shadow-xs"
                            >
                              {savingRentFor === u.id ? '...' : t('saveRent')}
                            </button>
                          )}
                        </form>
                      </td>
                      <td className="py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {formatTk(Number(u.advance_balance) || 0, lang, 0)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {u.id === ownerUid ? (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                            {t('primaryAdmin')}
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {u.role !== 'manager' ? (
                              <button
                                onClick={() => makeAdmin(u)}
                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 px-2 py-1 rounded transition-colors"
                              >
                                {t('makeAdmin')}
                              </button>
                            ) : (
                              <button
                                onClick={() => removeAdmin(u)}
                                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 px-2 py-1 rounded transition-colors"
                              >
                                {t('removeAdmin')}
                              </button>
                            )}
                            <button
                              onClick={() => kick(u)}
                              className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-2 py-1 rounded transition-colors"
                            >
                              {t('removeMember')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {allMembers.some((m) => m.status === 'left') && (
            <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">{t('leftMembers')}:</span>{' '}
              {allMembers
                .filter((m) => m.status === 'left')
                .map((m) => m.name)
                .join(', ')}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
