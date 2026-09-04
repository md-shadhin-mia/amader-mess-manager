import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: 'manager' | 'member';
  advance_balance: number;
  sonsthapon: number;
  /** Monthly room rent set by the manager. Each roommate can have a different amount. */
  room_rent?: number;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  error: null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(true);
      setError(null);

      try {
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const bootstrapRef = doc(db, 'settings', 'app');
          const [userSnap, bootstrapSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(bootstrapRef),
          ]);

          if (userSnap.exists()) {
            const profile = userSnap.data() as UserProfile;
            // During migration, the first existing user to sign in becomes the first admin.
            if (!bootstrapSnap.exists()) {
              const batch = writeBatch(db);
              batch.set(bootstrapRef, {
                firstAdminUid: user.uid,
                createdAt: serverTimestamp(),
              });
              if (profile.role !== 'manager') {
                batch.update(userRef, { role: 'manager' });
                profile.role = 'manager';
              }
              await batch.commit();
            }
            setUserProfile(profile);
          } else {
            const role: UserProfile['role'] = bootstrapSnap.exists() ? 'member' : 'manager';
            const newProfile: UserProfile = {
              uid: user.uid,
              name: user.displayName || 'New User',
              email: user.email || '',
              phone: user.phoneNumber || '',
              role,
              advance_balance: 0,
              sonsthapon: 0,
              room_rent: 0,
            };

            if (role === 'manager') {
              const batch = writeBatch(db);
              batch.set(bootstrapRef, {
                firstAdminUid: user.uid,
                createdAt: serverTimestamp(),
              });
              batch.set(userRef, newProfile);
              await batch.commit();
            } else {
              await setDoc(userRef, newProfile);
            }
            setUserProfile(newProfile);
          }
        } else {
          setUserProfile(null);
        }
      } catch (err) {
        console.error('Could not load the user profile from Firestore.', err);
        setUserProfile(null);
        setError('Could not load your profile. Please ensure Cloud Firestore is set up and try again.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}
