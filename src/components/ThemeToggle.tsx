import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  variant?: 'icon' | 'segmented';
  className?: string;
}

export default function ThemeToggle({ variant = 'icon', className = '' }: Props) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const { t } = useLanguage();

  if (variant === 'segmented') {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex items-center gap-0.5 border border-gray-200 dark:border-gray-700 ${className}`}>
        <button
          type="button"
          onClick={() => setTheme('light')}
          title={t('themeLight')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            theme === 'light'
              ? 'bg-white dark:bg-gray-700 shadow-sm text-amber-600 dark:text-amber-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>{t('themeLight')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('dark')}
          title={t('themeDark')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            theme === 'dark'
              ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Moon className="w-3.5 h-3.5" />
          <span>{t('themeDark')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('system')}
          title={t('themeSystem')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            theme === 'system'
              ? 'bg-white dark:bg-gray-700 shadow-sm text-purple-600 dark:text-purple-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>{t('themeSystem')}</span>
        </button>
      </div>
    );
  }

  // Default compact icon button
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={resolvedTheme === 'dark' ? t('themeLight') : t('themeDark')}
      aria-label="Toggle Theme"
      className={`p-2 rounded-lg text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-gray-600" />
      )}
    </button>
  );
}
