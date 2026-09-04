import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { userRef } from './lib/paths';
import type { Account } from './lib/tenant';

/** @deprecated kept as an alias for old imports; tenant profiles are `Member` from lib/tenant. */
export type UserProfile = Account;

interface AuthContextType {
  currentUser: User | null;
  /** Global account document (users/{uid}); membership data lives on the mess. */
  account: Account | null;
  /** From the `super_admin` custom claim, set only by scripts/set-super-admin.ts. */
  isSuperAdmin: boolean;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, account: null, isSuperAdmin: false, loading: true, error: null });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeAccount: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      setCurrentUser(user);
      setError(null);

      if (!user) {
        setAccount(null);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const claims = (await user.getIdTokenResult()).claims;
        setIsSuperAdmin(claims.super_admin === true);

        const ref = userRef(db, user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const fresh: Account = {
            uid: user.uid,
            name: user.displayName || 'New User',
            email: user.email || '',
            phone: user.phoneNumber || '',
            messes: {},
            current_mess_id: null,
          };
          await setDoc(ref, { ...fresh, created_at: serverTimestamp() });
        }

        unsubscribeAccount = onSnapshot(
          ref,
          (live) => {
            setAccount(live.exists() ? (live.data() as Account) : null);
            setLoading(false);
          },
          (err) => {
            console.error('Account subscription failed', err);
            setError('Could not load your account. Please try again.');
            setLoading(false);
          },
        );
      } catch (err) {
        console.error('Could not load the account from Firestore.', err);
        setAccount(null);
        setError('Could not load your profile. Please ensure Cloud Firestore is set up and try again.');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeAccount?.();
    };
  }, []);

  return <AuthContext.Provider value={{ currentUser, account, isSuperAdmin, loading, error }}>{children}</AuthContext.Provider>;
}
