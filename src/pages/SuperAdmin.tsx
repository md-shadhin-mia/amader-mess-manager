import { useState } from 'react';
import { collection, doc, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useCollection } from '../hooks/useCollection';
import { memberLimitFor, type Mess, type MessPlan, type MessStatus } from '../lib/tenant';
import PageHeader from '../components/PageHeader';

/** Platform console: every mess with its plan, status and seats. Super admins only (custom claim). */
export default function SuperAdmin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { docs, loading } = useCollection<Omit<Mess, 'id'>>(() => query(collection(db, 'messes')), 'messes:all');
  const [busy, setBusy] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});

  const messes = docs.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => a.name.localeCompare(b.name));

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
      </main>
    </div>
  );
}
