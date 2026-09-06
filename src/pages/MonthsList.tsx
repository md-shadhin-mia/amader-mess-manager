import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useMembers } from '../hooks/useMembers';
import { useMonths } from '../hooks/useMonths';
import { createBackfillMonth } from '../lib/closeMonth';
import { formatMonthId, previousMonthIds } from '../lib/dates';
import { isMonthEditable } from '../lib/monthLogic';
import { formatCount, formatTk } from '../lib/numbers';
import PageHeader from '../components/PageHeader';

/** Manager: every month with its status and headline totals, plus "add past month". */
export default function MonthsList() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { messId } = useMess();
  const { months, loading } = useMonths();
  const { allMembers } = useMembers();
  const [pastMonth, setPastMonth] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = new Set(months.map((m) => m.id));
  const candidates = previousMonthIds(36).filter((id) => !existing.has(id));

  const addPastMonth = async () => {
    if (!messId || !pastMonth) return;
    setBusy(true);
    try {
      // Copy amounts from the nearest earlier closed month as a starting point.
      const previous = months.find((m) => m.status === 'closed' && m.id < pastMonth) ?? months.find((m) => m.status === 'closed') ?? null;
      await createBackfillMonth(db, { messId, monthId: pastMonth, members: allMembers, previous });
      toast(t('pastMonthCreated'));
      navigate(`/admin/months/${pastMonth}/edit`);
    } catch (err) {
      console.error('Create past month failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: string) =>
    status === 'active' ? 'bg-green-100 text-green-700' : status === 'backfill' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700';
  const statusLabel = (status: string) => (status === 'active' ? t('active') : status === 'backfill' ? t('backfill') : t('closed'));

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <PageHeader title={t('monthReports')} backTo="/admin">
        <Link to="/admin/reports" className="text-sm font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">{t('yearOverview')}</Link>
      </PageHeader>
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-700">{t('addPastMonth')}</h2>
            <p className="text-xs text-gray-500">{t('addPastMonthHint')}</p>
          </div>
          <select value={pastMonth} onChange={(e) => setPastMonth(e.target.value)} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <option value="">—</option>
            {candidates.map((id) => <option key={id} value={id}>{formatMonthId(id)}</option>)}
          </select>
          <button onClick={addPastMonth} disabled={!pastMonth || busy} className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{t('add')}</button>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-400">{t('loading')}</p>
          ) : months.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">{t('noMonths')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="p-4 text-left font-medium">{t('months')}</th>
                  <th className="p-4 text-left font-medium">{t('status')}</th>
                  <th className="p-4 text-right font-medium">{t('totalMeals')}</th>
                  <th className="p-4 text-right font-medium">{t('mealRate')}</th>
                  <th className="p-4 text-right font-medium">{t('grandNet')}</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{formatMonthId(m.id)}</td>
                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge(m.status)}`}>{statusLabel(m.status)}</span></td>
                    <td className="p-4 text-right text-gray-700">{m.status === 'closed' ? formatCount(m.total_meals ?? 0, lang) : '—'}</td>
                    <td className="p-4 text-right text-gray-700">{m.status === 'closed' ? formatTk(m.meal_rate ?? 0, lang) : '—'}</td>
                    <td className="p-4 text-right text-gray-700">{m.grand ? formatTk(m.grand.net_payable, lang, 0) : '—'}</td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {isMonthEditable(m) && <Link to={`/admin/months/${m.id}/edit`} className="text-blue-600 hover:text-blue-800 font-medium mr-3">{t('editEntries')}</Link>}
                      <Link to={`/admin/months/${m.id}`} className="text-blue-600 hover:text-blue-800 font-medium">{t('viewReport')} →</Link>
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
