/**
 * Moves the legacy single-tenant data (top-level users, months, daily_meals,
 * bazar_expenses, payments, ...) into one mess under messes/{messId}.
 *
 * Copy mode, idempotent upserts by id, no deletes. Dry-run unless --apply.
 *
 *   bun run migrate --name "Amader Mess"            # dry run: prints counts
 *   bun run migrate --name "Amader Mess" --apply    # writes
 *   bun run migrate --mess-id <id> --apply          # re-run into the same mess
 *
 * The owner is settings/app.firstAdminUid (or --owner <uid>). Every legacy
 * user becomes an active member with their role, rent and advance. Users
 * docs are rewritten to the global shape with a messes index and
 * current_mess_id. A join code is written. Safe to re-run after deploying
 * the new client to pick up writes made in between.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { generateJoinCode, memberLimitFor } from '../src/lib/tenant';
import { batched, flag, initAdmin } from './admin';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const name = flag(args, '--name') || 'Amader Mess';
const ownerArg = flag(args, '--owner');
const messIdArg = flag(args, '--mess-id');
const timezone = flag(args, '--timezone') || 'Asia/Dhaka';

const COPY_COLLECTIONS = ['cost_categories', 'meal_types', 'daily_meals', 'bazar_expenses', 'payments', 'bazar_schedule'];

type Op = (batch: FirebaseFirestore.WriteBatch) => void;

async function main() {
  const { db, projectId } = initAdmin(args);
  console.log(`${apply ? 'MIGRATING' : 'DRY RUN'} project "${projectId}" → mess "${name}"`);

  const settings = await db.doc('settings/app').get();
  const owner = ownerArg || (settings.data()?.firstAdminUid as string | undefined);
  if (!owner) throw new Error('No owner: settings/app.firstAdminUid missing; pass --owner <uid>');

  const usersSnap = await db.collection('users').get();
  const legacyUsers = usersSnap.docs.filter((d) => d.data().role === 'manager' || d.data().role === 'member');
  if (legacyUsers.length === 0) throw new Error('No legacy users with a role found; nothing to migrate.');
  if (!legacyUsers.some((d) => d.id === owner)) throw new Error(`Owner ${owner} is not among the legacy users.`);

  // Reuse an existing mess id so the script is idempotent.
  let messId = messIdArg;
  if (!messId) {
    const existing = await db.collection('messes').where('legacy_migrated', '==', true).limit(1).get();
    messId = existing.empty ? db.collection('messes').doc().id : existing.docs[0].id;
  }
  const messRef = db.collection('messes').doc(messId);
  const messSnap = await messRef.get();
  const joinCode = (messSnap.data()?.join_code as string | undefined) || generateJoinCode();
  const memberCount = legacyUsers.length;
  const memberLimit = Math.max(memberLimitFor('free'), memberCount);

  const ops: Op[] = [];
  const counts: Record<string, number> = {};
  const count = (key: string, n = 1) => (counts[key] = (counts[key] || 0) + n);

  ops.push((b) =>
    b.set(
      messRef,
      {
        name: messSnap.data()?.name ?? name,
        owner_uid: owner,
        plan: messSnap.data()?.plan ?? 'free',
        status: messSnap.data()?.status ?? 'active',
        member_limit: Math.max(Number(messSnap.data()?.member_limit) || 0, memberLimit),
        member_count: memberCount,
        timezone: messSnap.data()?.timezone ?? timezone,
        join_code: joinCode,
        legacy_migrated: true,
        created_at: messSnap.data()?.created_at ?? FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  );
  count('messes');
  ops.push((b) => b.set(db.doc(`join_codes/${joinCode}`), { mess_id: messId, mess_name: name, created_by: owner, created_at: FieldValue.serverTimestamp() }, { merge: true }));
  count('join_codes');

  for (const user of legacyUsers) {
    const data = user.data();
    ops.push((b) =>
      b.set(
        messRef.collection('members').doc(user.id),
        {
          uid: user.id,
          name: data.name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          role: user.id === owner ? 'manager' : data.role,
          status: 'active',
          advance_balance: Number(data.advance_balance) || 0,
          room_rent: Number(data.room_rent) || 0,
          joined_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    );
    count('members');
    ops.push((b) =>
      b.set(
        user.ref,
        {
          uid: user.id,
          name: data.name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          ...(data.fcm_token ? { fcm_token: data.fcm_token } : {}),
          [`messes.${messId}`]: { name },
          current_mess_id: data.current_mess_id ?? messId,
        },
        { merge: true },
      ),
    );
    count('users');
  }

  for (const collection of COPY_COLLECTIONS) {
    const snap = await db.collection(collection).get();
    for (const d of snap.docs) {
      ops.push((b) => b.set(messRef.collection(collection).doc(d.id), d.data(), { merge: true }));
      count(collection);
    }
  }

  const months = await db.collection('months').get();
  for (const month of months.docs) {
    ops.push((b) => b.set(messRef.collection('months').doc(month.id), month.data(), { merge: true }));
    count('months');
    const settlements = await month.ref.collection('settlements').get();
    for (const row of settlements.docs) {
      ops.push((b) => b.set(messRef.collection('months').doc(month.id).collection('settlements').doc(row.id), row.data(), { merge: true }));
      count('settlements');
    }
  }

  console.log(`Mess id: ${messId}  owner: ${owner}  join code: ${joinCode}`);
  console.table(counts);
  if (!apply) {
    console.log(`Dry run only. Re-run with --apply to write ${ops.length} document(s).`);
    return;
  }
  const written = await batched(db as Firestore, ops);
  console.log(`Wrote ${written} document(s). Legacy top-level data was left in place; remove it once the app is verified.`);
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
