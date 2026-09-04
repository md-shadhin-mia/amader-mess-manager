import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { memberRef, messRef } from '../lib/paths';
import { switchMess as switchMessInDb } from '../lib/mess';
import type { Member, MemberRole, Mess } from '../lib/tenant';

interface MessContextType {
  /** The mess the user is currently working in, or null when they have none. */
  messId: string | null;
  mess: Mess | null;
  /** The user's profile inside that mess. Null until loaded or when access was lost. */
  member: Member | null;
  role: MemberRole | null;
  /** True when a mess is selected but cannot be used (suspended, left, deleted, denied). */
  blocked: boolean;
  loading: boolean;
  switchMess: (messId: string | null) => Promise<void>;
}

const MessContext = createContext<MessContextType>({
  messId: null,
  mess: null,
  member: null,
  role: null,
  blocked: false,
  loading: true,
  switchMess: async () => {},
});

export const useMess = () => useContext(MessContext);

export function MessProvider({ children }: { children: ReactNode }) {
  const { currentUser, account, loading: authLoading } = useAuth();
  const [mess, setMess] = useState<Mess | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // Current selection, falling back to the first known membership.
  const messId = useMemo(() => {
    if (!account) return null;
    if (account.current_mess_id && account.messes?.[account.current_mess_id]) return account.current_mess_id;
    if (account.current_mess_id) return account.current_mess_id;
    const first = Object.keys(account.messes || {})[0];
    return first ?? null;
  }, [account]);

  useEffect(() => {
    setMess(null);
    setMember(null);
    setBlocked(false);
    if (!currentUser || !messId) {
      setLoading(authLoading);
      return;
    }
    setLoading(true);
    let messLoaded = false;
    let memberLoaded = false;
    const done = () => {
      if (messLoaded && memberLoaded) setLoading(false);
    };
    const fail = (where: string) => (err: unknown) => {
      // permission-denied means the user left, the mess was suspended, or it no longer exists.
      console.warn(`Mess ${where} subscription lost`, err);
      setBlocked(true);
      setLoading(false);
    };
    const unsubMess = onSnapshot(
      messRef(db, messId),
      (snap) => {
        messLoaded = true;
        if (!snap.exists()) setBlocked(true);
        else setMess({ id: snap.id, ...(snap.data() as Omit<Mess, 'id'>) });
        done();
      },
      fail('doc'),
    );
    const unsubMember = onSnapshot(
      memberRef(db, messId, currentUser.uid),
      (snap) => {
        memberLoaded = true;
        const data = snap.exists() ? (snap.data() as Member) : null;
        if (!data || data.status !== 'active') setBlocked(true);
        setMember(data);
        done();
      },
      fail('member'),
    );
    return () => {
      unsubMess();
      unsubMember();
    };
  }, [currentUser, messId, authLoading]);

  const switchMess = useCallback(
    async (next: string | null) => {
      if (!currentUser) return;
      await switchMessInDb(db, currentUser.uid, next);
    },
    [currentUser],
  );

  const value = useMemo<MessContextType>(
    () => ({
      messId,
      mess,
      member,
      role: member?.status === 'active' ? member.role : null,
      blocked: blocked || mess?.status === 'suspended',
      loading: authLoading || loading,
      switchMess,
    }),
    [messId, mess, member, blocked, authLoading, loading, switchMess],
  );

  return <MessContext.Provider value={value}>{children}</MessContext.Provider>;
}
