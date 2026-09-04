/**
 * Google authentication without any SDK, using only Web Crypto and fetch so it
 * runs inside a Cloudflare Worker.
 *
 * - getAccessToken(): service-account JWT → OAuth2 access token for FCM + Firestore.
 * - verifyFirebaseIdToken(): checks a Firebase Auth ID token sent by the web app.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/datastore',
].join(' ');
const ID_TOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const encoder = new TextEncoder();

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must contain client_email and private_key');
  }
  return account as ServiceAccount;
}

// One access token per isolate; Google tokens last one hour.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlEncode(
    JSON.stringify({ iss: account.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const unsigned = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

interface Jwk extends JsonWebKey {
  kid: string;
}

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getIdTokenJwks(): Promise<Jwk[]> {
  // Google rotates these rarely; refresh every 6 hours.
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < 6 * 60 * 60 * 1000) return cachedJwks.keys;
  const response = await fetch(ID_TOKEN_JWKS_URL);
  if (!response.ok) throw new Error(`Could not fetch Firebase JWKS (${response.status})`);
  const data = (await response.json()) as { keys: Jwk[] };
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

export interface VerifiedIdToken {
  uid: string;
  email?: string;
}

/**
 * Verifies a Firebase Authentication ID token per
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<VerifiedIdToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(rawHeader)));
  } catch {
    throw new Error('Malformed ID token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected ID token header');

  let keys = await getIdTokenJwks();
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // Key may have rotated since the cache was filled; refetch once.
    cachedJwks = null;
    keys = await getIdTokenJwks();
    jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) throw new Error('ID token signed with an unknown key');
  }

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(rawSignature),
    encoder.encode(`${rawHeader}.${rawPayload}`),
  );
  if (!valid) throw new Error('ID token signature is invalid');

  let payload: { aud: string; iss: string; sub: string; exp: number; iat: number; email?: string };
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(rawPayload)));
  } catch {
    throw new Error('Malformed ID token');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('ID token audience mismatch');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('ID token issuer mismatch');
  if (payload.exp <= now) throw new Error('ID token has expired');
  if (payload.iat > now + 300) throw new Error('ID token issued in the future');
  if (!payload.sub) throw new Error('ID token has no subject');

  return { uid: payload.sub, email: payload.email };
}
