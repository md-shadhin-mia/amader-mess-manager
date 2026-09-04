import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  title: string;
  subtitle?: string;
  backTo: string;
  children?: ReactNode;
}

/** Compact header for secondary pages (reports), hidden when printing. */
export default function PageHeader({ title, subtitle, backTo, children }: Props) {
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 sticky top-0 z-10 print:hidden">
      <div className="min-w-0">
        <button onClick={() => navigate(backTo)} className="text-xs font-medium text-blue-600 hover:text-blue-800">← {t('backDashboard')}</button>
        <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <div className="bg-gray-100 rounded-lg p-1 flex">
          <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>বাংলা</button>
          <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>EN</button>
        </div>
        <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 hover:text-red-700">{t('signOut')}</button>
      </div>
    </header>
  );
}
