import { useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useCostCategories } from '../hooks/useCostCategories';
import { useMealTypes } from '../hooks/useMealTypes';
import { renameMess } from '../lib/mess';
import CategoryManager from '../components/admin/CategoryManager';
import MealTypeManager from '../components/admin/MealTypeManager';
import NotificationSettings from '../components/NotificationSettings';
import AdminLayout from '../components/admin/AdminLayout';

export default function AdminSettings() {
  const { mess } = useMess();
  const { t } = useLanguage();
  const { toast } = useToast();

  const { categories } = useCostCategories();
  const { mealTypes } = useMealTypes();

  const [messName, setMessName] = useState<string | null>(null);
  const [messTz, setMessTz] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <AdminLayout
      activeTab="settings"
      title={t('adminSettings')}
      subtitle={t('messSettingsPageHint')}
    >
      <div className="space-y-8 max-w-5xl">
        {/* Mess Profile / Basics */}
        {mess && (
          <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="flex flex-wrap justify-between items-start gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {t('messSettings')}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('messSettingsHint')}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2.5 py-1 rounded-full font-semibold ${
                  mess.plan === 'pro'
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}>
                  {mess.plan === 'pro' ? t('planPro') : t('planFree')}
                </span>
                <span className="text-gray-500">
                  {t('seats')}: <strong className="text-gray-800 dark:text-gray-200">{mess.member_count} / {mess.member_limit}</strong>
                </span>
              </div>
            </div>

            <form onSubmit={saveMess} className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('messName')}
                </label>
                <input
                  value={messName ?? mess.name}
                  onChange={(e) => setMessName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                  maxLength={60}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('timezone')}
                </label>
                <input
                  value={messTz ?? mess.timezone}
                  onChange={(e) => setMessTz(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={
                    busy === 'mess' ||
                    ((messName === null || messName === mess.name) &&
                      (messTz === null || messTz === mess.timezone))
                  }
                  className="text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl disabled:opacity-40 transition-colors shadow-xs"
                >
                  {busy === 'mess' ? '...' : t('saveMess')}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Cost Categories Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              {t('tabCosts')} - খরচের খাত ও ক্যাটাগরি
            </h3>
          </div>
          <CategoryManager categories={categories} />
        </section>

        {/* Meal Types and Weights */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              মিল ধরন ও ওজন (Weights)
            </h3>
          </div>
          <MealTypeManager mealTypes={mealTypes} />
        </section>

        {/* Notification Settings */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              পুশ নোটিফিকেশন ও অ্যালার্ট
            </h3>
          </div>
          <NotificationSettings />
        </section>
      </div>
    </AdminLayout>
  );
}
