import { collection, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../AuthContext';
import { useCollection } from './useCollection';

export type UserDoc = UserProfile & { id: string };

export function useUsers(): { users: UserDoc[]; loading: boolean } {
  const { docs, loading } = useCollection<UserProfile>(() => query(collection(db, 'users')), 'users');
  const users = docs
    .map((d) => ({ ...d.data, id: d.id, uid: d.data.uid || d.id }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { users, loading };
}
