/**
 * Seeds the default cost categories and meal types into Firestore.
 *
 * Idempotent: a collection that already has documents is left alone, so the
 * manager's edits are never overwritten. Pass --add-missing to also insert
 * any default whose id does not exist yet (e.g. after a new default is added
 * to src/lib/defaults.ts), still without touching existing documents.
 *
 * Credentials (first one found wins):
 *   FIREBASE_SERVICE_ACCOUNT   service-account JSON as a string
 *   GOOGLE_APPLICATION_CREDENTIALS   path to a service-account JSON file
 *   gcloud / firebase application default credentials
 *
 * Usage:
 *   bun run seed                 # or: npx tsx scripts/seed.ts
 *   bun run seed -- --add-missing
 *   bun run seed -- --project my-other-project
 */
import { readFileSync } from 'node:fs';
import { applicationDefault, cert, initializeApp, type Credential } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES, DEFAULT_MEAL_TYPES, MEAL_TYPES_COLLECTION } from '../src/lib/defaults';

const args = process.argv.slice(2);
const addMissing = args.includes('--add-missing');
const projectArg = args[args.indexOf('--project') + 1];

function resolveProjectId(): string {
  if (args.includes('--project') && projectArg) return projectArg;
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')) as { projects?: { default?: string } };
    if (rc.projects?.default) return rc.projects.default;
  } catch {
    // fall through
  }
  throw new Error('No project id: pass --project, set FIREBASE_PROJECT_ID, or add .firebaserc');
}

function resolveCredential(): Credential {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) return cert(JSON.parse(inline));
  return applicationDefault();
}

interface Seedable {
  id: string;
}

async function seedCollection<T extends Seedable>(db: Firestore, name: string, defaults: T[]): Promise<void> {
  const ref = db.collection(name);
  const snapshot = await ref.get();
  const existing = new Set(snapshot.docs.map((d) => d.id));

  let toWrite: T[];
  if (existing.size === 0) {
    toWrite = defaults;
  } else if (addMissing) {
    toWrite = defaults.filter((d) => !existing.has(d.id));
  } else {
    console.log(`• ${name}: ${existing.size} document(s) already present, skipped (use --add-missing to add new defaults)`);
    return;
  }

  if (toWrite.length === 0) {
    console.log(`• ${name}: nothing to add`);
    return;
  }

  const batch = db.batch();
  for (const item of toWrite) {
    const { id, ...data } = item;
    batch.set(ref.doc(id), data);
  }
  await batch.commit();
  console.log(`• ${name}: wrote ${toWrite.length} document(s): ${toWrite.map((d) => d.id).join(', ')}`);
}

async function main() {
  const projectId = resolveProjectId();
  initializeApp({ credential: resolveCredential(), projectId });
  const db = getFirestore();
  console.log(`Seeding defaults into project "${projectId}"${addMissing ? ' (add-missing mode)' : ''}`);
  await seedCollection(db, COST_CATEGORIES_COLLECTION, DEFAULT_COST_CATEGORIES);
  await seedCollection(db, MEAL_TYPES_COLLECTION, DEFAULT_MEAL_TYPES);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
