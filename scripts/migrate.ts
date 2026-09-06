/**
 * CLI Migration script: Moves legacy single-tenant collections into a multi-tenant mess.
 * Uses the logged-in Firebase CLI session (via Firestore REST API) so NO Firebase Admin SDK
 * or Google Cloud service account keys are required.
 *
 * Usage:
 *   bun run migrate --name "My Mess"            # dry run: prints counts
 *   bun run migrate --name "My Mess" --apply    # writes to Firestore
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateJoinCode, memberLimitFor } from '../src/lib/tenant';

// ---------- CLI arguments ----------
const args = process.argv.slice(2);
const apply = args.includes('--apply');

function flag(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}

const name = flag('--name') || 'Amader Mess';
const ownerArg = flag('--owner');
const messIdArg = flag('--mess-id');
const timezone = flag('--timezone') || 'Asia/Dhaka';

const COPY_COLLECTIONS = [
  'cost_categories',
  'meal_types',
  'daily_meals',
  'bazar_expenses',
  'payments',
  'bazar_schedule',
];

// ---------- Project ID Resolution ----------
function getProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const rcPath = path.resolve(process.cwd(), '.firebaserc');
    if (fs.existsSync(rcPath)) {
      const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
      if (rc.projects?.default) return rc.projects.default;
    }
  } catch {
    // ignore
  }
  try {
    const appletPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(appletPath)) {
      const cfg = JSON.parse(fs.readFileSync(appletPath, 'utf8'));
      if (cfg.projectId) return cfg.projectId;
    }
  } catch {
    // ignore
  }
  return 'amader-mess-manager';
}

// ---------- Auth Token Resolution ----------
async function getAccessToken(): Promise<string> {
  if (process.env.FIREBASE_TOKEN) return process.env.FIREBASE_TOKEN;
  if (process.env.GOOGLE_OAUTH_TOKEN) return process.env.GOOGLE_OAUTH_TOKEN;

  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'No Firebase CLI credentials found. Run "firebase login" in your terminal, or use the Web UI at /superadmin.',
    );
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  const tokens = config.tokens;

  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    throw new Error('No valid tokens in firebase-tools config. Run "firebase login".');
  }

  const isExpired = !tokens.expires_at || tokens.expires_at <= Date.now() + 60000;
  if (!isExpired && tokens.access_token) {
    return tokens.access_token;
  }

  // Refresh expired access token
  if (tokens.refresh_token) {
    const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { access_token: string; expires_in: number };
        tokens.access_token = data.access_token;
        tokens.expires_at = Date.now() + data.expires_in * 1000;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return data.access_token;
      }
    } catch {
      // ignore and fall back to current access token
    }
  }

  return tokens.access_token;
}

// ---------- Firestore REST Helpers ----------
function toRestValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toRestValue) } };
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toRestValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromRestValue(val: any): any {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      res[k] = fromRestValue(v);
    }
    return res;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map(fromRestValue);
  }
  return null;
}

function fromRestDoc(doc: any): { id: string; data: Record<string, any> } {
  const nameParts = doc.name.split('/');
  const id = nameParts[nameParts.length - 1];
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    data[k] = fromRestValue(v);
  }
  return { id, data };
}

interface WriteOp {
  path: string;
  data: Record<string, any>;
  merge?: boolean;
}

async function listCollection(
  baseUrl: string,
  token: string,
  collectionPath: string,
): Promise<{ id: string; data: Record<string, any> }[]> {
  const docs: { id: string; data: Record<string, any> }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${baseUrl}/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to list collection "${collectionPath}": ${res.status} ${txt}`);
    }

    const data = (await res.json()) as { documents?: any[]; nextPageToken?: string };
    if (data.documents) {
      for (const d of data.documents) {
        docs.push(fromRestDoc(d));
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

async function getDocument(
  baseUrl: string,
  token: string,
  docPath: string,
): Promise<{ id: string; data: Record<string, any> } | null> {
  const res = await fetch(`${baseUrl}/${docPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const json = await res.json();
  return fromRestDoc(json);
}

async function commitWrites(
  projectId: string,
  token: string,
  writes: WriteOp[],
  batchSize = 200,
): Promise<number> {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  let written = 0;

  for (let i = 0; i < writes.length; i += batchSize) {
    const chunk = writes.slice(i, i + batchSize);
    const restWrites = chunk.map((w) => {
      const fullDocName = `projects/${projectId}/databases/(default)/documents/${w.path}`;
      const fields: Record<string, any> = {};
      const fieldPaths: string[] = [];

      for (const [k, v] of Object.entries(w.data)) {
        fields[k] = toRestValue(v);
        fieldPaths.push(k);
      }

      const updatePayload: any = {
        name: fullDocName,
        fields,
      };

      const writeObj: any = {
        update: updatePayload,
      };

      if (w.merge) {
        writeObj.updateMask = { fieldPaths };
      }

      return writeObj;
    });

    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: restWrites }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Firestore commit failed on batch [${i}..${i + chunk.length}]: ${res.status} ${err}`);
    }

    written += chunk.length;
  }

  return written;
}

// ---------- Main Migration Routine ----------
async function main() {
  const projectId = getProjectId();
  const token = await getAccessToken();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  console.log(`${apply ? 'MIGRATING' : 'DRY RUN'} project "${projectId}" → mess "${name}"`);
  console.log('Using default Firestore REST API with active Firebase CLI session.');

  // 1. Resolve settings and owner
  const settingsDoc = await getDocument(baseUrl, token, 'settings/app');
  let owner = ownerArg || (settingsDoc?.data?.firstAdminUid as string | undefined);

  // 2. Fetch legacy users
  const allUsers = await listCollection(baseUrl, token, 'users');
  const legacyUsers = allUsers.filter(
    (u) => u.data.role === 'manager' || u.data.role === 'member' || !u.data.messes,
  );

  if (legacyUsers.length === 0) {
    console.warn('Notice: No legacy users found in top-level "users" collection.');
  }

  if (!owner) {
    const firstManager = legacyUsers.find((u) => u.data.role === 'manager');
    owner = firstManager?.id || legacyUsers[0]?.id;
    if (!owner) {
      throw new Error('No owner UID found. Pass --owner <uid> or ensure users exist in the database.');
    }
  }

  // 3. Resolve or create Mess ID
  let messId = messIdArg;
  if (!messId) {
    const existingMesses = await listCollection(baseUrl, token, 'messes');
    const migrated = existingMesses.find((m) => m.data.legacy_migrated === true);
    messId = migrated ? migrated.id : `mess_${Date.now().toString(36)}`;
  }

  const existingMessDoc = await getDocument(baseUrl, token, `messes/${messId}`);
  const joinCode = existingMessDoc?.data?.join_code || generateJoinCode();
  const memberCount = Math.max(legacyUsers.length, 1);
  const memberLimit = Math.max(memberLimitFor('free'), memberCount);

  const writes: WriteOp[] = [];
  const counts: Record<string, number> = {};
  const count = (key: string, n = 1) => (counts[key] = (counts[key] || 0) + n);
  const nowIso = new Date().toISOString();

  // A. Mess document
  writes.push({
    path: `messes/${messId}`,
    data: {
      name: existingMessDoc?.data?.name ?? name,
      owner_uid: owner,
      plan: existingMessDoc?.data?.plan ?? 'free',
      status: existingMessDoc?.data?.status ?? 'active',
      member_limit: Math.max(Number(existingMessDoc?.data?.member_limit) || 0, memberLimit),
      member_count: memberCount,
      timezone: existingMessDoc?.data?.timezone ?? timezone,
      join_code: joinCode,
      legacy_migrated: true,
      created_at: existingMessDoc?.data?.created_at ?? nowIso,
      updated_at: nowIso,
    },
    merge: true,
  });
  count('messes');

  // B. Join code
  writes.push({
    path: `join_codes/${joinCode}`,
    data: {
      mess_id: messId,
      mess_name: name,
      created_by: owner,
      created_at: nowIso,
    },
    merge: true,
  });
  count('join_codes');

  // C. App settings and admin record
  writes.push({
    path: 'settings/app',
    data: {
      firstAdminUid: owner,
      created_at: settingsDoc?.data?.created_at ?? nowIso,
      updated_at: nowIso,
    },
    merge: true,
  });
  count('settings');

  writes.push({
    path: `admins/${owner}`,
    data: {
      uid: owner,
      status: 'active',
      updated_at: nowIso,
    },
    merge: true,
  });
  count('admins');

  // D. Members & Users
  for (const user of legacyUsers) {
    const data = user.data;
    writes.push({
      path: `messes/${messId}/members/${user.id}`,
      data: {
        uid: user.id,
        name: data.name ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        role: user.id === owner ? 'manager' : data.role || 'member',
        status: 'active',
        advance_balance: Number(data.advance_balance) || 0,
        room_rent: Number(data.room_rent) || 0,
        joined_at: data.created_at ?? nowIso,
      },
      merge: true,
    });
    count('members');

    writes.push({
      path: `users/${user.id}`,
      data: {
        uid: user.id,
        name: data.name ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        ...(user.id === owner ? { status: 'admin' } : {}),
        [`messes`]: {
          ...(data.messes || {}),
          [messId]: { name },
        },
        current_mess_id: data.current_mess_id ?? messId,
      },
      merge: true,
    });
    count('users');
  }

  // E. Copy standard collections
  for (const col of COPY_COLLECTIONS) {
    const docs = await listCollection(baseUrl, token, col);
    for (const d of docs) {
      writes.push({
        path: `messes/${messId}/${col}/${d.id}`,
        data: d.data,
        merge: true,
      });
      count(col);
    }
  }

  // F. Copy months & settlements
  const months = await listCollection(baseUrl, token, 'months');
  for (const month of months) {
    writes.push({
      path: `messes/${messId}/months/${month.id}`,
      data: month.data,
      merge: true,
    });
    count('months');

    const settlements = await listCollection(baseUrl, token, `months/${month.id}/settlements`);
    for (const s of settlements) {
      writes.push({
        path: `messes/${messId}/months/${month.id}/settlements/${s.id}`,
        data: s.data,
        merge: true,
      });
      count('settlements');
    }
  }

  console.log(`\nMess ID:   ${messId}`);
  console.log(`Owner UID: ${owner}`);
  console.log(`Join Code: ${joinCode}\n`);

  console.table(counts);

  if (!apply) {
    console.log(`\n[DRY RUN COMPLETE] Total documents planned: ${writes.length}`);
    console.log('To apply these changes to Firestore, run:\n');
    console.log(`  bun run migrate --name "${name}" --apply\n`);
    return;
  }

  console.log(`\nApplying ${writes.length} document write(s) to Firestore...`);
  const committed = await commitWrites(projectId, token, writes);
  console.log(`\nSuccess! Successfully migrated ${committed} documents into mess "${messId}".`);
}

main().catch((err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
