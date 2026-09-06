import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { useMess } from '../contexts/MessContext';
import ThemeToggle from './ThemeToggle';

interface Props {
  title: string;
  subtitle?: string;
  backTo: string;
  children?: ReactNode;
}

/** Compact header for secondary pages (reports), hidden when printing. */
export default function PageHeader({ title, subtitle, backTo, children }: Props) {
  const { t, lang, setLang } = useLanguage();
  const { mess } = useMess();
  const navigate = useNavigate();
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 sticky top-0 z-10 print:hidden transition-colors">
      <div className="min-w-0">
        <button onClick={() => navigate(backTo)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">← {t('backDashboard')}</button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {mess && <button onClick={() => navigate('/messes')} className="text-blue-600 dark:text-blue-400 hover:underline mr-1">{mess.name}</button>}
          {subtitle}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <ThemeToggle />
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-1 flex">
          <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${lang === 'bn' ? 'bg-white dark:bg-gray-600 shadow text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>বাংলা</button>
          <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${lang === 'en' ? 'bg-white dark:bg-gray-600 shadow text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>EN</button>
        </div>
        <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">{t('signOut')}</button>
      </div>
    </header>
  );
}
