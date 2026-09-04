import { useNavigate, useParams } from 'react-router-dom';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useMonths } from '../hooks/useMonths';
import { useMonthSettlement } from '../hooks/useMonthSettlement';
import { formatMonthId } from '../lib/dates';
import { labelOf } from '../lib/labels';
import { formatCount, formatTk } from '../lib/numbers';
import PageHeader from '../components/PageHeader';

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'red' | 'green' }) {
  return (
    <div className={`flex justify-between py-2 border-b border-gray-100 last:border-0 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : 'text-gray-900'}>{value}</span>
    </div>
  );
}

/** A member's own month breakdown: meals, every category share, credits, advance, and what is due. */
export default function MemberMonth() {
  const { monthId: paramMonth } = useParams();
  const { member: userProfile } = useMess();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { months } = useMonths();

  const monthId = paramMonth || months.find((m) => m.status === 'active')?.id || months[0]?.id || null;
  const { month, mode, rows, categories, mealTypes, totals, loading } = useMonthSettlement(monthId, { onlyUid: userProfile?.uid });
  const row = rows[0] ?? null;

  const active = categories.filter((c) => c.active);
  const prepaid = active.filter((c) => c.timing === 'prepaid');
  const postpaid = active.filter((c) => c.timing === 'postpaid');
  const backTo = userProfile?.role === 'manager' ? '/admin' : '/member';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <PageHeader title={t('myMonth')} subtitle={userProfile?.name} backTo={backTo}>
        <select
          value={monthId ?? ''}
          onChange={(e) => navigate(`/member/months/${e.target.value}`)}
          className="text-sm px-3 py-1.5 bg-white border border-gray-200 rounded-lg"
          aria-label={t('selectMonth')}
        >
          {months.map((m) => (
            <option key={m.id} value={m.id}>{formatMonthId(m.id)} · {m.status === 'active' ? t('active') : t('closed')}</option>
          ))}
        </select>
      </PageHeader>

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        {loading && <p className="text-sm text-gray-400">{t('loading')}</p>}
        {!loading && !month && <p className="text-sm text-gray-500">{t('noMonths')}</p>}
        {!loading && month && mode === 'legacy' && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t('legacyMonthHint')}</p>}
        {!loading && month && mode !== 'legacy' && !row && <p className="text-sm text-gray-500">{t('noSettlementRow')}</p>}

        {month && row && totals && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className={`px-2 py-1 rounded font-medium ${mode === 'live' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                {mode === 'live' ? t('preview') : t('closed')}
              </span>
              <span className="text-gray-500">{t('mealRate')}: {formatTk(totals.meal_rate, lang)}</span>
            </div>

            <section className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-500">{mode === 'live' ? t('dueNow') : t('netPayable')}</p>
                <p className={`text-2xl font-semibold ${row.net_payable > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {formatTk(mode === 'live' ? row.due_now : row.net_payable, lang, 0)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-500">{mode === 'live' ? t('estimatedAtClose') : t('advanceAfter')}</p>
                <p className="text-2xl font-semibold text-gray-900">{formatTk(mode === 'live' ? row.net_payable : row.advance_after, lang, 0)}</p>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('mealsByType')}</h2>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(row.meals).map(([typeId, n]) => {
                  const type = mealTypes.find((m) => m.id === typeId);
                  return (
                    <span key={typeId} className="px-3 py-1 rounded-full bg-gray-100 text-sm text-gray-700">
                      {type ? labelOf(type, lang) : typeId}: <strong>{formatCount(n, lang)}</strong>
                    </span>
                  );
                })}
                {Object.keys(row.meals).length === 0 && <span className="text-sm text-gray-400">{t('noEntriesYet')}</span>}
              </div>
              <Line label={t('totalMeals')} value={formatCount(row.meal_count, lang)} />
              <Line label={t('mealCost')} value={formatTk(row.meal_cost, lang, 0)} />
            </section>

            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('breakdown')}</h2>
              <p className="text-xs text-gray-400 mb-1">{t('postpaidSection')}</p>
              <Line label={t('mealCost')} value={formatTk(row.meal_cost, lang, 0)} />
              {postpaid.map((c) => <Line key={c.id} label={labelOf(c, lang)} value={formatTk(row.shares[c.id] ?? 0, lang, 0)} />)}
              {prepaid.length > 0 && <p className="text-xs text-gray-400 mt-3 mb-1">{t('prepaidSection')}</p>}
              {prepaid.map((c) => <Line key={c.id} label={labelOf(c, lang)} value={formatTk(row.shares[c.id] ?? 0, lang, 0)} />)}
              <div className="mt-2">
                <Line label={t('charges')} value={formatTk(row.total_charges, lang, 0)} strong />
              </div>
            </section>

            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('credits')}</h2>
              <Line label={t('deposits')} value={formatTk(row.credits.deposits, lang, 0)} />
              <Line label={t('prepaidPaid')} value={formatTk(row.credits.prepaid_paid + row.credits.settlement_paid, lang, 0)} />
              <Line label={t('personalBazar')} value={formatTk(row.credits.personal_bazar, lang, 0)} />
              {row.fund_spent > 0 && <Line label={t('fundSpending')} value={formatTk(row.fund_spent, lang, 0)} />}
              <Line label={t('credits')} value={formatTk(row.credits.total, lang, 0)} strong />
            </section>

            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <Line label={t('grossDue')} value={formatTk(row.gross_due, lang, 0)} />
              <Line label={t('advanceBalance')} value={formatTk(row.advance_before, lang, 0)} />
              <Line label={t('advanceApplied')} value={formatTk(row.advance_applied, lang, 0)} />
              <Line label={row.net_payable > 0 ? t('netPayable') : t('refund')} value={formatTk(Math.abs(row.net_payable), lang, 0)} strong tone={row.net_payable > 0 ? 'red' : 'green'} />
              <Line label={t('advanceAfter')} value={formatTk(row.advance_after, lang, 0)} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
