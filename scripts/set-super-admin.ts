/**
 * Grants (or removes) the super_admin custom claim for the given emails.
 * Super admins manage every mess at /super. The user must sign out and back
 * in for the new claim to take effect.
 *
 *   bun run super-admin --email owner@example.com [--email other@example.com]
 *   bun run super-admin --email owner@example.com --remove
 */
import { getAuth } from 'firebase-admin/auth';
import { flags, initAdmin } from './admin';

const args = process.argv.slice(2);
const emails = flags(args, '--email');
const remove = args.includes('--remove');

async function main() {
  if (emails.length === 0) throw new Error('Pass at least one --email <address>');
  initAdmin(args);
  const auth = getAuth();
  for (const email of emails) {
    const user = await auth.getUserByEmail(email);
    const claims = { ...(user.customClaims || {}) } as Record<string, unknown>;
    if (remove) delete claims.super_admin;
    else claims.super_admin = true;
    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`${remove ? 'Removed super_admin from' : 'Granted super_admin to'} ${email} (${user.uid})`);
  }
  console.log('Done. Affected users must sign out and in again.');
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
