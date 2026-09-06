import { useState } from 'react';
import { collection, doc, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useCollection } from '../hooks/useCollection';
import { memberLimitFor, type AdminRecord, type Mess, type MessPlan, type MessStatus } from '../lib/tenant';
import { adminRef, adminsCol } from '../lib/paths';
import PageHeader from '../components/PageHeader';

/** Platform console: every mess and administrators list. Super admins only (Firestore status). */
export default function SuperAdmin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { docs, loading } = useCollection<Omit<Mess, 'id'>>(() => query(collection(db, 'messes')), 'messes:all');
  const { docs: adminDocs, loading: adminsLoading } = useCollection<Omit<AdminRecord, 'uid'>>(
    () => query(adminsCol(db)),
    'admins:all',
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  const messes = docs.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => a.name.localeCompare(b.name));
  const admins = adminDocs.map((d) => ({ uid: d.id, ...d.data }));

  const update = async (mess: Mess, patch: Partial<Pick<Mess, 'plan' | 'status' | 'member_limit'>>) => {
    setBusy(mess.id);
    try {
      await updateDoc(doc(db, 'messes', mess.id), { ...patch, updated_at: serverTimestamp() });
      toast(t('saved'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const setPlan = (mess: Mess, plan: MessPlan) => update(mess, { plan, member_limit: memberLimitFor(plan) });
  const toggleStatus = (mess: Mess) => {
    const status: MessStatus = mess.status === 'active' ? 'suspended' : 'active';
    if (status === 'suspended' && !confirm(`${t('suspendConfirm')} (${mess.name})`)) return;
    return update(mess, { status });
  };
  const saveLimit = (mess: Mess) => {
    const value = Number(limits[mess.id]);
    if (!Number.isInteger(value) || value < 1) return toast(t('invalidAmount'), { tone: 'error' });
    return update(mess, { member_limit: value });
  };

  const toggleAdminStatus = async (admin: AdminRecord) => {
    setBusy(`admin-${admin.uid}`);
    const nextStatus = admin.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(adminRef(db, admin.uid), { status: nextStatus, updated_at: serverTimestamp() });
      toast(t('saved'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = newAdminUid.trim();
    if (!uid) return;
    setAddingAdmin(true);
    try {
      await setDoc(adminRef(db, uid), {
        uid,
        email: newAdminEmail.trim(),
        status: 'active',
        created_at: serverTimestamp(),
      });
      setNewAdminUid('');
      setNewAdminEmail('');
      toast(t('adminAdded'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setAddingAdmin(false);
    }
  };

  const inputClass = 'px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm w-20';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <PageHeader title={t('superAdmin')} subtitle={t('superAdminHint')} backTo="/messes" />
      <main className="max-w-6xl mx-auto p-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-sm text-gray-400">{t('loading')}</p>
          ) : messes.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">{t('noMessesYet')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="p-3 text-left font-medium">{t('messName')}</th>
                  <th className="p-3 text-left font-medium">{t('owner')}</th>
                  <th className="p-3 text-left font-medium">{t('plan')}</th>
                  <th className="p-3 text-left font-medium">{t('status')}</th>
                  <th className="p-3 text-left font-medium">{t('members')}</th>
                  <th className="p-3 text-left font-medium">{t('timezone')}</th>
                  <th className="p-3 text-left font-medium">{t('joinCode')}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {messes.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100 last:border-0">
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{m.id}</div>
                    </td>
                    <td className="p-3 text-xs text-gray-500 font-mono">{m.owner_uid}</td>
                    <td className="p-3">
                      <select value={m.plan} onChange={(e) => setPlan(m, e.target.value as MessPlan)} disabled={busy === m.id} className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm">
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.status}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-900">{m.member_count} /</span>
                        <input className={inputClass} value={limits[m.id] ?? String(m.member_limit)} onChange={(e) => setLimits({ ...limits, [m.id]: e.target.value })} />
                        {limits[m.id] !== undefined && Number(limits[m.id]) !== m.member_limit && (
                          <button onClick={() => saveLimit(m)} className="text-xs font-medium text-blue-600">{t('save')}</button>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">{m.timezone}</td>
                    <td className="p-3 font-mono text-xs text-gray-500">{m.join_code}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => toggleStatus(m)} disabled={busy === m.id} className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${m.status === 'active' ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-700 border-green-200 hover:bg-green-50'}`}>
                        {m.status === 'active' ? t('suspend') : t('reactivate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Administrators Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('administrators')}</h2>
              <p className="text-xs text-gray-500">{t('administratorsHint')}</p>
            </div>
          </div>

          {adminsLoading ? (
            <p className="p-6 text-sm text-gray-400">{t('loading')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <th className="p-3 text-left font-medium">{t('adminUid')}</th>
                    <th className="p-3 text-left font-medium">{t('adminEmail')}</th>
                    <th className="p-3 text-left font-medium">{t('status')}</th>
                    <th className="p-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.uid} className="border-b border-gray-100 last:border-0">
                      <td className="p-3 font-mono text-xs text-gray-700">{a.uid}</td>
                      <td className="p-3 text-gray-600">{a.email || '—'}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {a.status === 'active' ? t('active') : t('inactive')}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => toggleAdminStatus(a as AdminRecord)}
                          disabled={busy === `admin-${a.uid}`}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                            a.status === 'active'
                              ? 'text-red-600 border-red-200 hover:bg-red-50'
                              : 'text-green-700 border-green-200 hover:bg-green-50'
                          }`}
                        >
                          {a.status === 'active' ? t('deactivate') : t('activate')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Admin Form */}
          <form onSubmit={handleAddAdmin} className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder={t('adminUid')}
              value={newAdminUid}
              onChange={(e) => setNewAdminUid(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded text-sm min-w-[240px]"
              required
            />
            <input
              type="email"
              placeholder={t('adminEmail')}
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded text-sm min-w-[200px]"
            />
            <button
              type="submit"
              disabled={addingAdmin || !newAdminUid.trim()}
              className="px-4 py-1.5 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {addingAdmin ? t('loading') : t('addAdmin')}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
