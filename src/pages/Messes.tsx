import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { createMess, joinMess, MessError } from '../lib/mess';
import { DEFAULT_TIMEZONE, normalizeJoinCode } from '../lib/tenant';

/**
 * Onboarding and switcher: the messes the user belongs to, plus create
 * a new mess or join one with a code.
 */
export default function Messes() {
  const { currentUser, account, isSuperAdmin } = useAuth();
  const { messId, switchMess, blocked } = useMess();
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | string | null>(null);
  const [legacy, setLegacy] = useState(false);

  const memberships = Object.entries(account?.messes || {});

  useEffect(() => {
    // Pre-multi-tenant installs left a settings/app doc; tell the admin to migrate instead of starting over.
    if (memberships.length > 0) return;
    getDoc(doc(db, 'settings', 'app'))
      .then((snap) => setLegacy(snap.exists()))
      .catch(() => setLegacy(false));
  }, [memberships.length]);

  const person = currentUser && account ? { uid: currentUser.uid, name: account.name, email: account.email, phone: account.phone } : null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!person || !name.trim()) return;
    setBusy('create');
    try {
      await createMess(db, person, { name, timezone });
      toast(t('messCreated'));
      navigate('/');
    } catch (err) {
      console.error('Create mess failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!person || !code.trim()) return;
    setBusy('join');
    try {
      const joined = await joinMess(db, person, code, account);
      toast(`${t('messJoined')}: ${joined.name}`);
      navigate('/');
    } catch (err) {
      console.error('Join mess failed', err);
      const key = err instanceof MessError ? ({ INVALID_CODE: 'joinInvalidCode', CODE_NOT_FOUND: 'joinCodeNotFound', NOT_ALLOWED: 'joinNotAllowed' } as const)[err.code as 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'NOT_ALLOWED'] ?? 'saveFailed' : 'saveFailed';
      toast(t(key), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    setBusy(id);
    try {
      await switchMess(id);
      navigate('/');
    } finally {
      setBusy(null);
    }
  };

  const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('appTitle')}</h1>
          <p className="text-sm text-gray-500">{account?.name} · {account?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && <Link to="/super" className="text-sm font-medium text-purple-700 hover:text-purple-900">{t('superAdmin')}</Link>}
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>বাংলা</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>EN</button>
          </div>
          <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 hover:text-red-700">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {legacy && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4">
            <p className="font-medium mb-1">{t('legacyDataTitle')}</p>
            <p>{t('legacyDataHint')}</p>
            <code className="block mt-2 bg-white/70 rounded px-2 py-1 text-xs">bun run migrate --name "My Mess" --apply</code>
          </div>
        )}

        {blocked && messId && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl p-4">{t('messBlocked')}</div>
        )}

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-1">{t('myMesses')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('myMessesHint')}</p>
          {memberships.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noMessesYet')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {memberships.map(([id, info]) => (
                <li key={id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{info.name}</p>
                    {id === messId && <p className="text-xs text-green-700">{t('currentMess')}</p>}
                  </div>
                  <button onClick={() => open(id)} disabled={busy === id} className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {t('openMess')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-900 mb-1">{t('joinMess')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('joinMessHint')}</p>
            <form onSubmit={join} className="space-y-3">
              <input
                value={code}
                onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
                placeholder="ABCD EFGH JK"
                className={`${inputClass} font-mono tracking-widest uppercase`}
                autoCapitalize="characters"
                maxLength={10}
                required
              />
              <button type="submit" disabled={busy === 'join'} className="w-full h-11 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {busy === 'join' ? t('loading') : t('joinMess')}
              </button>
            </form>
          </section>

          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-900 mb-1">{t('createMess')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('createMessHint')}</p>
            <form onSubmit={create} className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('messName')} className={inputClass} required maxLength={60} />
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Dhaka" className={inputClass} />
              <button type="submit" disabled={busy === 'create'} className="w-full h-11 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                {busy === 'create' ? t('loading') : t('createMess')}
              </button>
              <p className="text-xs text-gray-400">{t('createMessPlanNote')}</p>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
