import { collection, deleteDoc, doc, getDoc, increment, serverTimestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { joinCodeRef, memberRef, messRef, userRef } from './paths';
import { seedCostCategoriesIfEmpty } from './costCategories';
import { seedMealTypesIfEmpty } from './mealTypes';
import { DEFAULT_TIMEZONE, generateJoinCode, isValidJoinCode, memberLimitFor, normalizeJoinCode, type Account, type JoinCode, type Mess } from './tenant';

export class MessError extends Error {
  constructor(public code: 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'MESS_INACTIVE' | 'ALREADY_MEMBER' | 'MESS_FULL' | 'NOT_ALLOWED', message: string) {
    super(message);
  }
}

interface Person {
  uid: string;
  name: string;
  email: string;
  phone?: string;
}

/**
 * Creates a mess with the caller as its owner/manager. One batch for the
 * tenant documents (validated together by the rules), then the default
 * categories and meal types in small follow-up batches.
 */
export async function createMess(db: Firestore, person: Person, input: { name: string; timezone?: string }): Promise<string> {
  const name = input.name.trim();
  const messId = doc(collection(db, 'messes')).id;
  const code = generateJoinCode();
  const batch = writeBatch(db);
  batch.set(messRef(db, messId), {
    name,
    owner_uid: person.uid,
    plan: 'free',
    status: 'active',
    member_limit: memberLimitFor('free'),
    member_count: 1,
    timezone: input.timezone || DEFAULT_TIMEZONE,
    join_code: code,
    created_at: serverTimestamp(),
  });
  batch.set(memberRef(db, messId, person.uid), {
    uid: person.uid,
    name: person.name,
    email: person.email,
    phone: person.phone || '',
    role: 'manager',
    status: 'active',
    advance_balance: 0,
    room_rent: 0,
    joined_at: serverTimestamp(),
  });
  batch.set(joinCodeRef(db, code), { mess_id: messId, mess_name: name, created_by: person.uid, created_at: serverTimestamp() });
  batch.update(userRef(db, person.uid), { [`messes.${messId}`]: { name }, current_mess_id: messId });
  await batch.commit();

  await seedCostCategoriesIfEmpty(db, messId);
  await seedMealTypesIfEmpty(db, messId);
  return messId;
}

/** Joins the mess behind a code as a member. Rules re-validate every step. */
export async function joinMess(db: Firestore, person: Person, rawCode: string, account: Account | null): Promise<{ messId: string; name: string }> {
  const code = normalizeJoinCode(rawCode);
  if (!isValidJoinCode(code)) throw new MessError('INVALID_CODE', 'Invalid join code');

  const codeSnap = await getDoc(joinCodeRef(db, code));
  if (!codeSnap.exists()) throw new MessError('CODE_NOT_FOUND', 'Join code not found');
  const { mess_id: messId, mess_name } = codeSnap.data() as JoinCode;

  if (account?.messes?.[messId]) {
    // Already listed: just switch to it. Rules would reject a duplicate join anyway.
    await updateDoc(userRef(db, person.uid), { current_mess_id: messId });
    return { messId, name: account.messes[messId].name };
  }

  const batch = writeBatch(db);
  batch.set(memberRef(db, messId, person.uid), {
    uid: person.uid,
    name: person.name,
    email: person.email,
    phone: person.phone || '',
    role: 'member',
    status: 'active',
    advance_balance: 0,
    room_rent: 0,
    joined_at: serverTimestamp(),
    joined_with_code: code,
  });
  batch.update(messRef(db, messId), { member_count: increment(1) });
  batch.update(userRef(db, person.uid), { [`messes.${messId}`]: { name: mess_name }, current_mess_id: messId });
  try {
    await batch.commit();
  } catch (err) {
    // The rules reject a full or suspended mess or a stale code; surface a friendly reason.
    const message = err instanceof Error ? err.message : String(err);
    if (/permission|PERMISSION_DENIED/i.test(message)) throw new MessError('NOT_ALLOWED', 'The mess is full, suspended, or the code has changed.');
    throw err;
  }
  return { messId, name: mess_name };
}

export async function switchMess(db: Firestore, uid: string, messId: string | null): Promise<void> {
  await updateDoc(userRef(db, uid), { current_mess_id: messId });
}

/** Replaces the join code: new code doc, mess updated, old code removed. */
export async function rotateJoinCode(db: Firestore, mess: Mess, byUid: string): Promise<string> {
  const code = generateJoinCode();
  const batch = writeBatch(db);
  batch.set(joinCodeRef(db, code), { mess_id: mess.id, mess_name: mess.name, created_by: byUid, created_at: serverTimestamp() });
  batch.update(messRef(db, mess.id), { join_code: code, updated_at: serverTimestamp() });
  await batch.commit();
  if (mess.join_code && mess.join_code !== code) {
    await deleteDoc(joinCodeRef(db, mess.join_code)).catch((err) => console.warn('Old join code not removed', err));
  }
  return code;
}

/** Marks a member as left and frees their seat. Their history stays in the mess. */
export async function removeMember(db: Firestore, messId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(memberRef(db, messId, uid), { status: 'left', role: 'member' });
  batch.update(messRef(db, messId), { member_count: increment(-1) });
  await batch.commit();
}

export async function renameMess(db: Firestore, messId: string, name: string, timezone: string): Promise<void> {
  await updateDoc(messRef(db, messId), { name: name.trim(), timezone, updated_at: serverTimestamp() });
}
