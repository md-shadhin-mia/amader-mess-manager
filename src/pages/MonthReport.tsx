import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useMonthSettlement } from '../hooks/useMonthSettlement';
import { formatMonthId } from '../lib/dates';
import { labelOf } from '../lib/labels';
import { formatCount, formatTk } from '../lib/numbers';
import { downloadTextFile, toCsv } from '../lib/csv';
import { describeWarning } from '../lib/warnings';
import type { SettlementRow } from '../lib/settlement';
import PageHeader from '../components/PageHeader';

interface Column {
  key: string;
  label: string;
  group?: 'prepaid' | 'postpaid';
  value: (row: SettlementRow) => number;
  kind: 'count' | 'money';
}

/** Manager month report: per-member table with dynamic category columns, totals, print and CSV. */
export default function MonthReport() {
  const { monthId = '' } = useParams();
  const { t, lang } = useLanguage();
  const { month, mode, rows, categories, totals, loading } = useMonthSettlement(monthId);

  const active = categories.filter((c) => c.active);
  const prepaid = active.filter((c) => c.timing === 'prepaid');
  const postpaid = active.filter((c) => c.timing === 'postpaid');

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: 'meal_count', label: t('meals'), value: (r) => r.meal_count, kind: 'count' },
      { key: 'meal_cost', label: t('mealCost'), group: 'postpaid', value: (r) => r.meal_cost, kind: 'money' },
      ...postpaid.map<Column>((c) => ({ key: `cat:${c.id}`, label: labelOf(c, lang), group: 'postpaid', value: (r) => r.shares[c.id] ?? 0, kind: 'money' })),
      ...prepaid.map<Column>((c) => ({ key: `cat:${c.id}`, label: labelOf(c, lang), group: 'prepaid', value: (r) => r.shares[c.id] ?? 0, kind: 'money' })),
      { key: 'total_charges', label: t('charges'), value: (r) => r.total_charges, kind: 'money' },
      { key: 'deposits', label: t('deposits'), value: (r) => r.credits.deposits, kind: 'money' },
      { key: 'prepaid_paid', label: t('prepaidPaid'), value: (r) => r.credits.prepaid_paid + r.credits.settlement_paid, kind: 'money' },
      { key: 'personal_bazar', label: t('personalBazar'), value: (r) => r.credits.personal_bazar, kind: 'money' },
      { key: 'advance_applied', label: t('advanceApplied'), value: (r) => r.advance_applied, kind: 'money' },
      { key: 'net_payable', label: t('netPayable'), value: (r) => r.net_payable, kind: 'money' },
    ];
    return cols;
  }, [prepaid, postpaid, lang, t]);

  const sums = columns.map((col) => Math.round(rows.reduce((s, r) => s + col.value(r), 0) * 100) / 100);

  const exportCsv = () => {
    const header = [t('name'), ...columns.map((c) => c.label)];
    const body = rows.map((r) => [r.name, ...columns.map((c) => c.value(r))]);
    downloadTextFile(`mess-${monthId}.csv`, toCsv([header, ...body, [t('totals'), ...sums]]));
  };

  const fmt = (col: Column, value: number) => (col.kind === 'count' ? formatCount(value, lang) : formatTk(value, lang, 0));

  return (
    <div className="min-h-screen bg-gray-50 pb-12 print:bg-white">
      <PageHeader title={`${t('reportTitle')} · ${monthId ? formatMonthId(monthId) : ''}`} backTo="/admin">
        <Link to="/admin/months" className="text-sm font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">{t('months')}</Link>
        <button onClick={exportCsv} disabled={rows.length === 0} className="text-sm font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">{t('downloadCsv')}</button>
        <button onClick={() => window.print()} className="text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">{t('print')}</button>
      </PageHeader>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4 print:p-0 print:max-w-none">
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-semibold">{t('appTitle')} · {t('reportTitle')} · {monthId ? formatMonthId(monthId) : ''}</h1>
        </div>

        {loading && <p className="text-sm text-gray-400">{t('loading')}</p>}
        {!loading && mode === 'missing' && <p className="text-sm text-gray-500">{t('noMonths')}</p>}

        {month && totals && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {mode === 'live' && <span className="px-2 py-1 rounded bg-green-100 text-green-800 font-medium">{t('preview')}</span>}
              {mode === 'closed' && <span className="px-2 py-1 rounded bg-gray-200 text-gray-800 font-medium">{t('closed')}</span>}
              {mode === 'legacy' && <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">{t('legacyMonthHint')}</span>}
            </div>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                [t('totalMeals'), formatCount(totals.total_meals, lang)],
                [t('mealRate'), formatTk(totals.meal_rate, lang)],
                [t('totalBazar'), formatTk(totals.total_bazar, lang, 0)],
                [t('fundSpending'), formatTk(totals.total_fund_spending, lang, 0)],
                [t('deposits'), formatTk(totals.total_deposits, lang, 0)],
                [t('fundCashOnHand'), formatTk(totals.fund_cash_on_hand, lang, 0)],
                [t('grandCharges'), formatTk(totals.grand.charges, lang, 0)],
                [t('grandNet'), formatTk(totals.grand.net_payable, lang, 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 print:border-gray-300 print:shadow-none">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-lg font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </section>

            {totals.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 print:hidden">
                <p className="font-medium mb-1">{t('warnings')}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {totals.warnings.map((w) => {
                    const { key, detail } = describeWarning(w);
                    return <li key={w}>{t(key)}{detail ? ` (${detail})` : ''}</li>;
                  })}
                </ul>
              </div>
            )}

            {mode === 'legacy' ? (
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-sm text-gray-600 space-y-2">
                <p>{t('legacyMonth')}</p>
                <ul className="list-disc pl-5">
                  {Object.entries(totals.category_totals).map(([k, v]) => <li key={k}>{k}: {formatTk(v, lang, 0)}</li>)}
                  {month.member_rents && <li>{t('roomRent')}: {formatTk(month.total_room_rent ?? 0, lang, 0)}</li>}
                </ul>
              </section>
            ) : (
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto print:border-0 print:shadow-none">
                <table className="w-full text-xs md:text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th colSpan={1 + postpaid.length} className="p-2 text-center font-medium border-l border-gray-200">{t('postpaidSection')}</th>
                      {prepaid.length > 0 && <th colSpan={prepaid.length} className="p-2 text-center font-medium border-l border-gray-200">{t('prepaidSection')}</th>}
                      <th colSpan={6} className="p-2 text-center font-medium border-l border-gray-200">{t('settlement')}</th>
                    </tr>
                    <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                      <th className="p-2 text-left font-medium sticky left-0 bg-gray-50">{t('name')}</th>
                      {columns.map((c) => (
                        <th key={c.key} className={`p-2 text-right font-medium whitespace-nowrap ${c.key === 'meal_cost' || c.key === `cat:${prepaid[0]?.id}` || c.key === 'total_charges' ? 'border-l border-gray-200' : ''}`}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.uid} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="p-2 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">
                          {r.name}
                          {r.weight !== 1 && <span className="ml-1 text-xs text-gray-400">×{r.weight}</span>}
                        </td>
                        {columns.map((c) => {
                          const v = c.value(r);
                          return (
                            <td key={c.key} className={`p-2 text-right whitespace-nowrap ${c.key === 'net_payable' ? (v > 0 ? 'font-semibold text-red-700' : v < 0 ? 'font-semibold text-green-700' : 'font-semibold text-gray-900') : 'text-gray-700'} ${c.key === 'meal_cost' || c.key === `cat:${prepaid[0]?.id}` || c.key === 'total_charges' ? 'border-l border-gray-100' : ''}`}>
                              {fmt(c, v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={columns.length + 1} className="p-4 text-center text-gray-400">{t('noEntriesYet')}</td></tr>
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
                        <td className="p-2 sticky left-0 bg-gray-50">{t('totals')}</td>
                        {columns.map((c, i) => <td key={c.key} className="p-2 text-right whitespace-nowrap">{fmt(c, sums[i])}</td>)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
