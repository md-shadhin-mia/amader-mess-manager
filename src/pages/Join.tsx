import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, db, googleProvider } from '../firebase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { joinMess, MessError } from '../lib/mess';
import { normalizeJoinCode } from '../lib/tenant';
import ThemeToggle from '../components/ThemeToggle';

export default function Join() {
  const { code: rawCode = '' } = useParams<{ code: string }>();
  const code = normalizeJoinCode(rawCode);
  const { currentUser, account, loading: authLoading } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [joining, setJoining] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (authLoading || !currentUser || !code || hasAttempted.current) return;
    hasAttempted.current = true;
    setJoining(true);
    setError(null);

    const person = {
      uid: currentUser.uid,
      name: account?.name || currentUser.displayName || 'New User',
      email: account?.email || currentUser.email || '',
      phone: account?.phone || currentUser.phoneNumber || '',
    };

    joinMess(db, person, code, account)
      .then((joined) => {
        toast(`${t('messJoined')}: ${joined.name}`);
        navigate('/');
      })
      .catch((err) => {
        console.error('Direct join failed', err);
        const key =
          err instanceof MessError
            ? ({
                INVALID_CODE: 'joinInvalidCode',
                CODE_NOT_FOUND: 'joinCodeNotFound',
                NOT_ALLOWED: 'joinNotAllowed',
              } as const)[err.code as 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'NOT_ALLOWED'] ?? 'saveFailed'
            : 'saveFailed';
        const msg = t(key);
        toast(msg, { tone: 'error' });
        setError(msg);
        setJoining(false);
      });
  }, [authLoading, currentUser, code, account, navigate, t, toast]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSignInLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // Once signed in, onAuthStateChanged sets currentUser and the useEffect will trigger auto-join
    } catch (err: any) {
      console.error('Sign in error during join', err);
      setError(err?.message || 'Could not sign in with Google');
      setSignInLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 transition-colors">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-1 flex">
          <button
            onClick={() => setLang('bn')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              lang === 'bn'
                ? 'bg-blue-50 dark:bg-gray-700 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            বাংলা
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              lang === 'en'
                ? 'bg-blue-50 dark:bg-gray-700 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            English
          </button>
        </div>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-8 text-center">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('appTitle')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('joinInvitePrompt')}</p>
          </div>

          {/* Join Code Box */}
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl p-4 mb-6">
            <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-1">{t('joinCode')}</p>
            <p className="font-mono text-2xl tracking-widest text-blue-900 dark:text-blue-200 font-semibold">
              {code || '—'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          {joining || authLoading ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{t('joiningMess')}</p>
            </div>
          ) : !currentUser ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('signInToJoin')}</p>
              <button
                onClick={handleGoogleSignIn}
                disabled={signInLoading}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                    <path
                      fill="#4285F4"
                      d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                    />
                    <path
                      fill="#34A853"
                      d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                    />
                  </g>
                </svg>
                {signInLoading ? t('loading') : t('signInGoogle')}
              </button>
            </div>
          ) : error ? (
            <button
              onClick={() => navigate('/messes')}
              className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('myMesses')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
