import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { adminRef, userRef } from './lib/paths';
import type { Account } from './lib/tenant';

/** @deprecated kept as an alias for old imports; tenant profiles are `Member` from lib/tenant. */
export type UserProfile = Account;

interface AuthContextType {
  currentUser: User | null;
  /** Global account document (users/{uid}); membership data lives on the mess. */
  account: Account | null;
  /** True if user has active admin status in /admins/{uid}, users/{uid}.status == 'admin', or super_admin claim. */
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
    let unsubscribeAdmin: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeAccount?.();
      unsubscribeAccount = null;
      unsubscribeAdmin?.();
      unsubscribeAdmin = null;

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
        const hasClaim = claims.super_admin === true;

        const appSettingsRef = doc(db, 'settings', 'app');
        const userDocRef = userRef(db, user.uid);
        const myAdminRef = adminRef(db, user.uid);

        const [settingsSnap, userSnap, adminSnap] = await Promise.all([
          getDoc(appSettingsRef),
          getDoc(userDocRef),
          getDoc(myAdminRef),
        ]);

        const isFirstBootstrap = !settingsSnap.exists();

        if (isFirstBootstrap) {
          // Atomic bootstrap for the first user: create app settings, admin record, and user account with status: 'admin'
          const batch = writeBatch(db);
          batch.set(appSettingsRef, {
            firstAdminUid: user.uid,
            created_at: serverTimestamp(),
          });
          batch.set(myAdminRef, {
            uid: user.uid,
            email: user.email || '',
            status: 'active',
            created_at: serverTimestamp(),
          });
          const initialAccount: Account = {
            uid: user.uid,
            name: user.displayName || 'New User',
            email: user.email || '',
            phone: user.phoneNumber || '',
            status: 'admin',
            messes: {},
            current_mess_id: null,
          };
          batch.set(userDocRef, { ...initialAccount, created_at: serverTimestamp() });
          await batch.commit();
        } else if (!userSnap.exists()) {
          const fresh: Account = {
            uid: user.uid,
            name: user.displayName || 'New User',
            email: user.email || '',
            phone: user.phoneNumber || '',
            status: 'member',
            messes: {},
            current_mess_id: null,
          };
          await setDoc(userDocRef, { ...fresh, created_at: serverTimestamp() });
        }

        const computeIsAdmin = (admData?: { status?: string }, accData?: Account | null) => {
          return (
            hasClaim ||
            isFirstBootstrap ||
            admData?.status === 'active' ||
            accData?.status === 'admin'
          );
        };

        let currentAdminData = adminSnap.data() as { status?: string } | undefined;
        let currentAccountData = userSnap.data() as Account | undefined;

        setIsSuperAdmin(computeIsAdmin(currentAdminData, currentAccountData));

        unsubscribeAdmin = onSnapshot(myAdminRef, (docSnap) => {
          currentAdminData = docSnap.exists() ? (docSnap.data() as { status?: string }) : undefined;
          setIsSuperAdmin(computeIsAdmin(currentAdminData, currentAccountData));
        });

        unsubscribeAccount = onSnapshot(
          userDocRef,
          (live) => {
            currentAccountData = live.exists() ? (live.data() as Account) : null;
            setAccount(currentAccountData);
            setIsSuperAdmin(computeIsAdmin(currentAdminData, currentAccountData));
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
      unsubscribeAdmin?.();
    };
  }, []);

  return <AuthContext.Provider value={{ currentUser, account, isSuperAdmin, loading, error }}>{children}</AuthContext.Provider>;
}
