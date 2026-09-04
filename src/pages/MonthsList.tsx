import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useMonths } from '../hooks/useMonths';
import { formatMonthId } from '../lib/dates';
import { formatCount, formatTk } from '../lib/numbers';
import PageHeader from '../components/PageHeader';

/** Manager: every month with its status and headline totals. */
export default function MonthsList() {
  const { t, lang } = useLanguage();
  const { months, loading } = useMonths();

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <PageHeader title={t('monthReports')} backTo="/admin" />
      <main className="max-w-4xl mx-auto p-6">
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
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {m.status === 'active' ? t('active') : t('closed')}
                      </span>
                    </td>
                    <td className="p-4 text-right text-gray-700">{m.status === 'closed' ? formatCount(m.total_meals ?? 0, lang) : '—'}</td>
                    <td className="p-4 text-right text-gray-700">{m.status === 'closed' ? formatTk(m.meal_rate ?? 0, lang) : '—'}</td>
                    <td className="p-4 text-right text-gray-700">{m.grand ? formatTk(m.grand.net_payable, lang, 0) : '—'}</td>
                    <td className="p-4 text-right">
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
