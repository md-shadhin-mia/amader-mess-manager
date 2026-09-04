/**
 * Seeds the default cost categories and meal types into every mess.
 *
 * Idempotent: a collection that already has documents is left alone, so the
 * manager's edits are never overwritten. Pass --add-missing to also insert
 * any default whose id does not exist yet, still without touching existing
 * documents. Pass --mess <id> to seed one mess only.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT (JSON string), GOOGLE_APPLICATION_CREDENTIALS
 * (file path), or application default credentials.
 *
 *   bun run seed
 *   bun run seed --add-missing
 *   bun run seed --mess abc123 --add-missing
 */
import type { Firestore } from 'firebase-admin/firestore';
import { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, DEFAULT_MEAL_TYPES, MEAL_TYPES_COLLECTION } from '../src/lib/defaults';
import { flag, initAdmin } from './admin';

const args = process.argv.slice(2);
const addMissing = args.includes('--add-missing');
const onlyMess = flag(args, '--mess');

async function seedCollection<T extends { id: string }>(db: Firestore, messId: string, name: string, defaults: T[]): Promise<void> {
  const ref = db.collection('messes').doc(messId).collection(name);
  const snapshot = await ref.get();
  const existing = new Set(snapshot.docs.map((d) => d.id));

  let toWrite: T[];
  if (existing.size === 0) toWrite = defaults;
  else if (addMissing) toWrite = defaults.filter((d) => !existing.has(d.id));
  else {
    console.log(`  • ${name}: ${existing.size} present, skipped (use --add-missing to add new defaults)`);
    return;
  }
  if (toWrite.length === 0) {
    console.log(`  • ${name}: nothing to add`);
    return;
  }
  const batch = db.batch();
  for (const item of toWrite) {
    const { id, ...data } = item;
    batch.set(ref.doc(id), data);
  }
  await batch.commit();
  console.log(`  • ${name}: wrote ${toWrite.length}: ${toWrite.map((d) => d.id).join(', ')}`);
}

async function main() {
  const { db, projectId } = initAdmin(args);
  const messes = onlyMess
    ? [await db.collection('messes').doc(onlyMess).get()].filter((d) => d.exists)
    : (await db.collection('messes').get()).docs;
  console.log(`Seeding defaults in project "${projectId}" for ${messes.length} mess(es)${addMissing ? ' (add-missing mode)' : ''}`);
  if (messes.length === 0) console.log('No messes found. Messes are created from the app; run scripts/migrate-to-multitenant.ts for legacy data.');
  for (const mess of messes) {
    console.log(`Mess ${mess.id} (${(mess.data() as { name?: string }).name ?? ''})`);
    await seedCollection(db, mess.id, COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES);
    await seedCollection(db, mess.id, MEAL_TYPES_COLLECTION, DEFAULT_MEAL_TYPES);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
