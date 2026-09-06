import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useMembers } from '../hooks/useMembers';
import { useYearSummary } from '../hooks/useYearSummary';
import { downloadTextFile, toCsv } from '../lib/csv';
import { formatMonthId } from '../lib/dates';
import { formatCount, formatTk } from '../lib/numbers';
import PageHeader from '../components/PageHeader';

/** Manager: every month of a year side by side, plus each member's totals across the closed months. */
export default function YearOverview() {
  const { t, lang } = useLanguage();
  const [year, setYear] = useState(new Date().getFullYear());
  const { months, members, loading } = useYearSummary(year);
  const { allMembers } = useMembers();

  const nameOf = (uid: string, fallback: string) => allMembers.find((m) => m.uid === uid)?.name || fallback;
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const closed = months.filter((m) => m.status === 'closed');
  const sum = (pick: (m: typeof months[number]) => number) => Math.round(closed.reduce((s, m) => s + pick(m), 0) * 100) / 100;

  const exportCsv = () => {
    const monthRows = months.map((m) => [formatMonthId(m.id), m.status, m.total_meals ?? '', m.meal_rate ?? '', m.total_bazar ?? '', m.grand?.charges ?? '', m.grand?.net_payable ?? '']);
    const memberRows = members.map((m) => [nameOf(m.uid, m.name), m.months, m.meal_count, m.meal_cost, m.total_charges, m.credits, m.net_payable]);
    downloadTextFile(
      `mess-${year}.csv`,
      toCsv([
        [t('months'), t('status'), t('totalMeals'), t('mealRate'), t('totalBazar'), t('grandCharges'), t('grandNet')],
        ...monthRows,
        [],
        [t('name'), t('months'), t('meals'), t('mealCost'), t('charges'), t('credits'), t('netPayable')],
        ...memberRows,
      ]),
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-12 print:bg-white">
      <PageHeader title={`${t('yearOverview')} · ${year}`} backTo="/admin">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Link to="/admin/months" className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">{t('months')}</Link>
        <button onClick={exportCsv} disabled={months.length === 0} className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">{t('downloadCsv')}</button>
        <button onClick={() => window.print()} className="text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">{t('print')}</button>
      </PageHeader>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 print:p-0">
        <div className="hidden print:block"><h1 className="text-xl font-semibold">{t('appTitle')} · {t('yearOverview')} · {year}</h1></div>
        {loading && <p className="text-sm text-gray-400 dark:text-gray-500">{t('loading')}</p>}
        {!loading && months.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">{t('noMonths')}</p>}

        {months.length > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
                  <th className="p-3 text-left font-medium">{t('months')}</th>
                  <th className="p-3 text-left font-medium">{t('status')}</th>
                  <th className="p-3 text-right font-medium">{t('totalMeals')}</th>
                  <th className="p-3 text-right font-medium">{t('mealRate')}</th>
                  <th className="p-3 text-right font-medium">{t('totalBazar')}</th>
                  <th className="p-3 text-right font-medium">{t('grandCharges')}</th>
                  <th className="p-3 text-right font-medium">{t('grandNet')}</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="p-3 font-medium text-gray-900 dark:text-white"><Link to={`/admin/months/${m.id}`} className="hover:text-blue-700 dark:hover:text-blue-400">{formatMonthId(m.id)}</Link></td>
                    <td className="p-3 text-gray-500 dark:text-gray-400">{m.status === 'closed' ? t('closed') : m.status === 'backfill' ? t('backfill') : t('inProgress')}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.status === 'closed' ? formatCount(m.total_meals ?? 0, lang) : '—'}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.status === 'closed' ? formatTk(m.meal_rate ?? 0, lang) : '—'}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.status === 'closed' ? formatTk(m.total_bazar ?? 0, lang, 0) : '—'}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.grand ? formatTk(m.grand.charges, lang, 0) : '—'}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.grand ? formatTk(m.grand.net_payable, lang, 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-t-2 border-gray-300 dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
                  <td className="p-3" colSpan={2}>{t('totals')} ({closed.length} {t('closed')})</td>
                  <td className="p-3 text-right">{formatCount(sum((m) => m.total_meals ?? 0), lang)}</td>
                  <td className="p-3 text-right">—</td>
                  <td className="p-3 text-right">{formatTk(sum((m) => m.total_bazar ?? 0), lang, 0)}</td>
                  <td className="p-3 text-right">{formatTk(sum((m) => m.grand?.charges ?? 0), lang, 0)}</td>
                  <td className="p-3 text-right">{formatTk(sum((m) => m.grand?.net_payable ?? 0), lang, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {members.length > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-4 pt-4">{t('memberTotals')}</h2>
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
                  <th className="p-3 text-left font-medium">{t('name')}</th>
                  <th className="p-3 text-right font-medium">{t('months')}</th>
                  <th className="p-3 text-right font-medium">{t('meals')}</th>
                  <th className="p-3 text-right font-medium">{t('mealCost')}</th>
                  <th className="p-3 text-right font-medium">{t('charges')}</th>
                  <th className="p-3 text-right font-medium">{t('credits')}</th>
                  <th className="p-3 text-right font-medium">{t('netPayable')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.uid} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="p-3 font-medium text-gray-900 dark:text-white">{nameOf(m.uid, m.name)}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{m.months}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{formatCount(m.meal_count, lang)}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{formatTk(m.meal_cost, lang, 0)}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{formatTk(m.total_charges, lang, 0)}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{formatTk(m.credits, lang, 0)}</td>
                    <td className={`p-3 text-right font-semibold ${m.net_payable > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{formatTk(m.net_payable, lang, 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-t-2 border-gray-300 dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
                  <td className="p-3">{t('totals')}</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right">{formatCount(members.reduce((s, m) => s + m.meal_count, 0), lang)}</td>
                  <td className="p-3 text-right">{formatTk(members.reduce((s, m) => s + m.meal_cost, 0), lang, 0)}</td>
                  <td className="p-3 text-right">{formatTk(members.reduce((s, m) => s + m.total_charges, 0), lang, 0)}</td>
                  <td className="p-3 text-right">{formatTk(members.reduce((s, m) => s + m.credits, 0), lang, 0)}</td>
                  <td className="p-3 text-right">{formatTk(members.reduce((s, m) => s + m.net_payable, 0), lang, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
