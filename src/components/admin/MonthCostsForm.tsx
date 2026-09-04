import { useEffect, useState, type FormEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { MonthDoc } from '../../hooks/useMonths';
import type { UserDoc } from '../../hooks/useUsers';
import { isSharedAmountCategory, type CostCategory } from '../../lib/costCategories';
import { labelOf } from '../../lib/labels';
import { formatTk, parseAmount } from '../../lib/numbers';

interface Props {
  month: MonthDoc;
  categories: CostCategory[];
  users: UserDoc[];
}

const WEIGHTS: { value: number; key: 'weightFull' | 'weightHalf' | 'weightNone' }[] = [
  { value: 1, key: 'weightFull' },
  { value: 0.5, key: 'weightHalf' },
  { value: 0, key: 'weightNone' },
];

/**
 * Amounts for the active month, rendered from the dynamic category list:
 * one field per shared category, a per-member grid for per_member categories,
 * and each member's share weight for equal splits.
 */
export default function MonthCostsForm({ month, categories, users }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [memberCosts, setMemberCosts] = useState<Record<string, Record<string, string>>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const active = categories.filter((c) => c.active);
  const shared = active.filter(isSharedAmountCategory);
  const perMember = active.filter((c) => c.split_rule === 'per_member' && !c.builtin);
  const rentCategory = active.find((c) => c.builtin === 'room_rent');

  useEffect(() => {
    setFixed(Object.fromEntries(Object.entries(month.fixed_costs || {}).map(([k, v]) => [k, String(v ?? 0)])));
    setMemberCosts(
      Object.fromEntries(
        Object.entries(month.member_costs || {}).map(([cat, byUid]) => [cat, Object.fromEntries(Object.entries(byUid || {}).map(([uid, v]) => [uid, String(v ?? 0)]))]),
      ),
    );
    setWeights({ ...(month.member_weights || {}) });
  }, [month.id, month.fixed_costs, month.member_costs, month.member_weights]);

  const sharedTotal = shared.reduce((sum, c) => sum + (parseAmount(fixed[c.id] ?? '') ?? 0), 0);
  const perMemberTotal = perMember.reduce((sum, c) => sum + users.reduce((s, u) => s + (parseAmount(memberCosts[c.id]?.[u.uid] ?? '') ?? 0), 0), 0);
  const rentTotal = users.reduce((sum, u) => sum + (Number(u.room_rent) || 0), 0);
  const activeMemberWeight = users.reduce((sum, u) => sum + (weights[u.uid] ?? 1), 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const fixedOut: Record<string, number> = {};
    for (const c of shared) fixedOut[c.id] = parseAmount(fixed[c.id] ?? '') ?? 0;
    const memberOut: Record<string, Record<string, number>> = {};
    for (const c of perMember) {
      memberOut[c.id] = {};
      for (const u of users) memberOut[c.id][u.uid] = parseAmount(memberCosts[c.id]?.[u.uid] ?? '') ?? 0;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'months', month.id), { fixed_costs: fixedOut, member_costs: memberOut, member_weights: weights });
      toast(t('monthCostsSaved'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-lg font-medium text-gray-900 mb-1">{t('monthlyCosts')} · {month.month_id}</h2>
      <p className="text-sm text-gray-500 mb-4">{t('monthlyCostsHint')}</p>

      <form onSubmit={save} className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('sharedCosts')}</h3>
          {shared.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noActiveCategories')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {shared.map((c) => (
                <div key={c.id}>
                  <label className="block text-sm text-gray-600 mb-1">
                    {labelOf(c, lang)}
                    <span className="ml-1 text-xs text-gray-400">
                      · {c.split_rule === 'by_meals' ? t('splitByMeals') : t('splitEqual')} · {c.timing === 'prepaid' ? t('timingPrepaid') : t('timingPostpaid')}
                    </span>
                  </label>
                  <input
                    inputMode="decimal"
                    value={fixed[c.id] ?? '0'}
                    onChange={(e) => setFixed({ ...fixed, [c.id]: e.target.value })}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {(perMember.length > 0 || rentCategory) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('perMemberCosts')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <th className="p-2 text-left font-medium">{t('name')}</th>
                    <th className="p-2 text-left font-medium">{t('memberShare')}</th>
                    {rentCategory && <th className="p-2 text-left font-medium">{labelOf(rentCategory, lang)} <span className="text-xs text-gray-400">({t('editInDirectory')})</span></th>}
                    {perMember.map((c) => <th key={c.id} className="p-2 text-left font-medium">{labelOf(c, lang)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uid} className="border-b border-gray-100 last:border-0">
                      <td className="p-2 text-gray-900 font-medium whitespace-nowrap">{u.name}</td>
                      <td className="p-2">
                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                          {WEIGHTS.map((w) => (
                            <button
                              key={w.value}
                              type="button"
                              onClick={() => setWeights({ ...weights, [u.uid]: w.value })}
                              className={`px-2.5 py-1 text-xs font-medium ${(weights[u.uid] ?? 1) === w.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {t(w.key)}
                            </button>
                          ))}
                        </div>
                      </td>
                      {rentCategory && <td className="p-2 text-gray-700">{formatTk(Number(u.room_rent) || 0, lang, 0)}</td>}
                      {perMember.map((c) => (
                        <td key={c.id} className="p-2">
                          <input
                            inputMode="decimal"
                            value={memberCosts[c.id]?.[u.uid] ?? '0'}
                            onChange={(e) => setMemberCosts({ ...memberCosts, [c.id]: { ...(memberCosts[c.id] || {}), [u.uid]: e.target.value } })}
                            className={`${inputClass} w-28`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-900">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>{t('totalShared')}: <strong>{formatTk(sharedTotal, lang, 0)}</strong></span>
            <span>{t('totalPerMember')}: <strong>{formatTk(perMemberTotal + rentTotal, lang, 0)}</strong></span>
            <span>{t('memberShare')}: <strong>{activeMemberWeight}</strong> / {users.length}</span>
          </div>
          <button type="submit" disabled={saving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
            {saving ? t('loading') : t('saveMonthCosts')}
          </button>
        </div>
      </form>
    </section>
  );
}
