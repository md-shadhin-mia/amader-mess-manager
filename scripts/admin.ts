/** Shared firebase-admin bootstrap for the scripts in this folder. */
import { readFileSync } from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp, type Credential } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function flags(args: string[], name: string): string[] {
  const out: string[] = [];
  args.forEach((arg, i) => {
    if (arg === name && args[i + 1]) out.push(args[i + 1]);
  });
  return out;
}

export function resolveProjectId(args: string[]): string {
  const fromArg = flag(args, '--project');
  if (fromArg) return fromArg;
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

export function initAdmin(args: string[]): { db: Firestore; projectId: string } {
  const projectId = resolveProjectId(args);
  if (getApps().length === 0) initializeApp({ credential: resolveCredential(), projectId });
  return { db: getFirestore(), projectId };
}

/** Commits writes in chunks well under Firestore's 500-op batch limit. */
export async function batched(db: Firestore, ops: ((batch: FirebaseFirestore.WriteBatch) => void)[], size = 400): Promise<number> {
  let written = 0;
  for (let i = 0; i < ops.length; i += size) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + size)) op(batch);
    await batch.commit();
    written += Math.min(size, ops.length - i);
  }
  return written;
}
