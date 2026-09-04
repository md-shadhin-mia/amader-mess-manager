import { query } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { messCol } from '../lib/paths';
import type { Member } from '../lib/tenant';
import { useCollection } from './useCollection';

export type MemberDoc = Member & { id: string };

/** Members of the current mess. `members` = active only; `allMembers` includes people who left. */
export function useMembers(): { members: MemberDoc[]; allMembers: MemberDoc[]; loading: boolean } {
  const { messId } = useMess();
  const { docs, loading } = useCollection<Member>(() => (messId ? query(messCol(db, messId, 'members')) : null), `members:${messId}`);
  const allMembers = docs
    .map((d) => ({ ...d.data, id: d.id, uid: d.data.uid || d.id }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { members: allMembers.filter((m) => m.status === 'active'), allMembers, loading };
}
