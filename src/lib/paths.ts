import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore';

/**
 * Every tenant collection lives under messes/{messId}. All Firestore access in
 * the app goes through these helpers so no bare top-level tenant path exists.
 */
export type TenantCollection =
  | 'members'
  | 'cost_categories'
  | 'meal_types'
  | 'months'
  | 'daily_meals'
  | 'bazar_expenses'
  | 'payments'
  | 'bazar_schedule';

export const messRef = (db: Firestore, messId: string): DocumentReference => doc(db, 'messes', messId);

export const messCol = (db: Firestore, messId: string, name: TenantCollection): CollectionReference =>
  collection(db, 'messes', messId, name);

export const messDoc = (db: Firestore, messId: string, name: TenantCollection, id: string): DocumentReference =>
  doc(db, 'messes', messId, name, id);

export const memberRef = (db: Firestore, messId: string, uid: string): DocumentReference => messDoc(db, messId, 'members', uid);

export const settlementsCol = (db: Firestore, messId: string, monthId: string): CollectionReference =>
  collection(db, 'messes', messId, 'months', monthId, 'settlements');

export const settlementRef = (db: Firestore, messId: string, monthId: string, uid: string): DocumentReference =>
  doc(db, 'messes', messId, 'months', monthId, 'settlements', uid);

export const userRef = (db: Firestore, uid: string): DocumentReference => doc(db, 'users', uid);

export const joinCodeRef = (db: Firestore, code: string): DocumentReference => doc(db, 'join_codes', code);

export const mealDocId = (uid: string, date: string): string => `${uid}_${date}`;
