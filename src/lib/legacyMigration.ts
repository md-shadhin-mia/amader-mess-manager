import { collection, doc, getDocs, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { generateJoinCode, memberLimitFor } from './tenant';
import { messRef } from './paths';

export interface MigrationSummary {
  messId: string;
  counts: Record<string, number>;
  totalWritten: number;
}

const COPY_COLLECTIONS = ['cost_categories', 'meal_types', 'daily_meals', 'bazar_expenses', 'payments', 'bazar_schedule'];

/**
 * Migrates legacy single-tenant collections into a tenant mess using default
 * client-side Firestore. Bypasses the need for Firebase Admin SDK or service accounts.
 */
export async function migrateLegacyToMess(
  db: Firestore,
  messName: string,
  ownerUid: string,
  onProgress?: (message: string) => void,
): Promise<MigrationSummary> {
  onProgress?.('Fetching legacy users...');
  const usersSnap = await getDocs(collection(db, 'users'));
  const legacyUsers = usersSnap.docs;

  // Check for an existing migrated mess or generate a new ID
  const messesSnap = await getDocs(collection(db, 'messes'));
  let messId = '';
  for (const m of messesSnap.docs) {
    if (m.data().legacy_migrated === true) {
      messId = m.id;
      break;
    }
  }
  if (!messId) {
    messId = doc(collection(db, 'messes')).id;
  }

  const joinCode = generateJoinCode();
  const counts: Record<string, number> = {};
  let totalWritten = 0;

  const count = (key: string, n = 1) => {
    counts[key] = (counts[key] || 0) + n;
    totalWritten += n;
  };

  let batch = writeBatch(db);
  let batchOps = 0;

  const commitIfNeeded = async () => {
    if (batchOps >= 350) {
      await batch.commit();
      batch = writeBatch(db);
      batchOps = 0;
    }
  };

  const addOp = async (op: (b: ReturnType<typeof writeBatch>) => void) => {
    op(batch);
    batchOps++;
    await commitIfNeeded();
  };

  // 1. Mess document
  await addOp((b) =>
    b.set(
      messRef(db, messId),
      {
        name: messName,
        owner_uid: ownerUid,
        plan: 'free',
        status: 'active',
        member_limit: Math.max(memberLimitFor('free'), legacyUsers.length),
        member_count: Math.max(legacyUsers.length, 1),
        timezone: 'Asia/Dhaka',
        join_code: joinCode,
        legacy_migrated: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true },
    ),
  );
  count('messes');

  // 2. Join code
  await addOp((b) =>
    b.set(
      doc(db, 'join_codes', joinCode),
      { mess_id: messId, mess_name: messName, created_by: ownerUid, created_at: serverTimestamp() },
      { merge: true },
    ),
  );
  count('join_codes');

  // 3. Register owner as admin and in settings/app
  await addOp((b) =>
    b.set(
      doc(db, 'admins', ownerUid),
      {
        uid: ownerUid,
        status: 'active',
        created_at: serverTimestamp(),
      },
      { merge: true },
    ),
  );
  count('admins');

  await addOp((b) =>
    b.set(
      doc(db, 'settings', 'app'),
      {
        firstAdminUid: ownerUid,
        created_at: serverTimestamp(),
      },
      { merge: true },
    ),
  );
  count('settings');

  // 4. Migrate members & update user docs
  onProgress?.(`Migrating ${legacyUsers.length} user(s)...`);
  const hasOwner = legacyUsers.some((u) => u.id === ownerUid);

  for (const u of legacyUsers) {
    const data = u.data();
    await addOp((b) =>
      b.set(
        doc(db, 'messes', messId, 'members', u.id),
        {
          uid: u.id,
          name: data.name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          role: u.id === ownerUid ? 'manager' : data.role || 'member',
          status: 'active',
          advance_balance: Number(data.advance_balance) || 0,
          room_rent: Number(data.room_rent) || 0,
          joined_at: serverTimestamp(),
        },
        { merge: true },
      ),
    );
    count('members');

    await addOp((b) =>
      b.set(
        doc(db, 'users', u.id),
        {
          [`messes.${messId}`]: { name: messName },
          current_mess_id: data.current_mess_id ?? messId,
        },
        { merge: true },
      ),
    );
    count('users');
  }

  // Ensure owner is added if not in legacy users
  if (!hasOwner) {
    await addOp((b) =>
      b.set(
        doc(db, 'messes', messId, 'members', ownerUid),
        {
          uid: ownerUid,
          name: 'Manager',
          email: '',
          phone: '',
          role: 'manager',
          status: 'active',
          advance_balance: 0,
          room_rent: 0,
          joined_at: serverTimestamp(),
        },
        { merge: true },
      ),
    );
    count('members');

    await addOp((b) =>
      b.set(
        doc(db, 'users', ownerUid),
        {
          status: 'admin',
          [`messes.${messId}`]: { name: messName },
          current_mess_id: messId,
        },
        { merge: true },
      ),
    );
    count('users');
  }

  // 5. Copy top-level collections
  for (const colName of COPY_COLLECTIONS) {
    onProgress?.(`Copying ${colName}...`);
    const snap = await getDocs(collection(db, colName));
    for (const d of snap.docs) {
      await addOp((b) =>
        b.set(doc(db, 'messes', messId, colName, d.id), d.data(), { merge: true }),
      );
      count(colName);
    }
  }

  // 6. Copy months and settlements
  onProgress?.('Copying months and settlements...');
  const monthsSnap = await getDocs(collection(db, 'months'));
  for (const m of monthsSnap.docs) {
    await addOp((b) =>
      b.set(doc(db, 'messes', messId, 'months', m.id), m.data(), { merge: true }),
    );
    count('months');

    const settlementsSnap = await getDocs(collection(db, 'months', m.id, 'settlements'));
    for (const s of settlementsSnap.docs) {
      await addOp((b) =>
        b.set(doc(db, 'messes', messId, 'months', m.id, 'settlements', s.id), s.data(), { merge: true }),
      );
      count('settlements');
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return { messId, counts, totalWritten };
}
