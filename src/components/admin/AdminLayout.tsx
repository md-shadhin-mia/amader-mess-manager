import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useMess } from '../../contexts/MessContext';
import { useLanguage } from '../../contexts/LanguageContext';
import ThemeToggle from '../ThemeToggle';
import Avatar from '../Avatar';
import ProfileModal from '../ProfileModal';
import { usePendingPayments } from '../../hooks/useMonthEntries';

interface AdminLayoutProps {
  children: ReactNode;
  activeTab?: 'overview' | 'members' | 'payments' | 'costs' | 'settings' | 'months' | 'reports';
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function AdminLayout({
  children,
  activeTab,
  title,
  subtitle,
  action,
}: AdminLayoutProps) {
  const { isSuperAdmin } = useAuth();
  const { mess, member: userProfile } = useMess();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const { pending } = usePendingPayments();

  // Determine active tab if not passed explicitly
  const currentTab = activeTab ?? (
    location.pathname === '/admin' ? 'overview' :
    location.pathname.startsWith('/admin/members') ? 'members' :
    location.pathname.startsWith('/admin/payments') ? 'payments' :
    location.pathname.startsWith('/admin/costs') ? 'costs' :
    location.pathname.startsWith('/admin/settings') ? 'settings' :
    location.pathname.startsWith('/admin/months') ? 'months' :
    location.pathname.startsWith('/admin/reports') ? 'reports' : 'overview'
  );

  const navItems = [
    {
      id: 'overview',
      path: '/admin',
      label: t('adminOverview'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'members',
      path: '/admin/members',
      label: t('adminMembers'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'payments',
      path: '/admin/payments',
      label: t('adminPayments'),
      badge: pending.length > 0 ? pending.length : null,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'costs',
      path: '/admin/costs',
      label: t('adminCosts'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      path: '/admin/settings',
      label: t('adminSettings'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'months',
      path: '/admin/months',
      label: t('monthReports'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'reports',
      path: '/admin/reports',
      label: t('yearOverview'),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-16 transition-colors font-sans text-gray-900 dark:text-gray-100">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {/* Main Top Header */}
      <header className="bg-slate-900 dark:bg-gray-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center py-3.5 gap-3">
            
            {/* Left: Mess identity and Manager quick badge */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowProfile(true)}
                className="relative group focus:outline-none"
                title={t('editProfile')}
              >
                <Avatar name={userProfile?.name} photoUrl={userProfile?.photo_url} size="md" />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-white">
                    {mess?.name ?? t('adminPanel')}
                  </h1>
                  {mess?.plan === 'pro' && (
                    <span className="bg-purple-600/30 text-purple-300 border border-purple-500/40 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      PRO
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 dark:text-slate-400 mt-0.5">
                  <span>
                    {t('manager')}: <strong className="text-slate-100">{userProfile?.name}</strong>
                  </span>
                  <span>•</span>
                  <Link to="/messes" className="hover:text-blue-300 underline transition-colors">
                    {t('switchMess')}
                  </Link>
                  {isSuperAdmin && (
                    <>
                      <span>•</span>
                      <Link to="/super" className="hover:text-amber-300 underline transition-colors">
                        {t('superAdmin')}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions, utilities and Profile */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
              <button
                onClick={() => navigate('/member/entry')}
                className="text-xs font-medium bg-slate-800 hover:bg-slate-700 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <span>🍽️</span>
                <span>{t('myMealEntry')}</span>
              </button>

              <button
                onClick={() => setShowProfile(true)}
                className="text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {t('editProfile')}
              </button>

              <ThemeToggle className="text-slate-300 hover:text-white hover:bg-slate-800" />

              {/* Language Switcher */}
              <div className="bg-slate-800 dark:bg-gray-800 border border-slate-700 rounded-lg p-0.5 flex">
                <button
                  onClick={() => setLang('bn')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    lang === 'bn' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  বাং
                </button>
                <button
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    lang === 'en' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  EN
                </button>
              </div>

              <button
                onClick={() => auth.signOut()}
                className="text-xs font-medium bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                {t('signOut')}
              </button>
            </div>

          </div>
        </div>

        {/* Secondary Sub-Navigation Bar (Responsive Tabs) */}
        <div className="border-t border-slate-800/80 bg-slate-950/70 dark:bg-gray-950/70 backdrop-blur-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none" aria-label="Admin Sections">
              {navItems.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge !== null && item.badge !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive ? 'bg-white text-blue-700' : 'bg-amber-500 text-white'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Page Title & Action Bar (Optional if provided by sub-page) */}
      {(title || subtitle || action) && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-4 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {title && <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {children}
      </main>
    </div>
  );
}
