/** Multi-tenant types and pure helpers. No Firebase imports (shared with scripts and tests). */

export type MessPlan = 'free' | 'pro';
export type MessStatus = 'active' | 'suspended';
export type MemberRole = 'manager' | 'member';
export type MemberStatus = 'active' | 'left';

export const PLAN_MEMBER_LIMITS: Record<MessPlan, number> = { free: 10, pro: 100 };
export const DEFAULT_TIMEZONE = 'Asia/Dhaka';
export const JOIN_CODE_LENGTH = 10;

export interface Mess {
  id: string;
  name: string;
  owner_uid: string;
  plan: MessPlan;
  status: MessStatus;
  member_limit: number;
  member_count: number;
  timezone: string;
  join_code: string;
  created_at?: unknown;
  updated_at?: unknown;
}

/** A person's profile inside one mess. Replaces the old top-level users doc for tenant data. */
export interface Member {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: MemberRole;
  advance_balance: number;
  room_rent: number;
  status: MemberStatus;
  joined_at?: unknown;
  joined_with_code?: string;
}

/** Global account, one per Google sign-in. */
export interface Account {
  uid: string;
  name: string;
  email: string;
  phone: string;
  fcm_token?: string;
  fcm_token_updated_at?: unknown;
  current_mess_id?: string | null;
  /** Client-side index of memberships for the switcher. Rules never trust it. */
  messes?: Record<string, { name: string }>;
  created_at?: unknown;
}

export interface JoinCode {
  mess_id: string;
  mess_name: string;
  created_by: string;
  created_at?: unknown;
}

// No 0/O/1/I so codes can be read aloud or typed from a photo without confusion.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(length = JOIN_CODE_LENGTH, random: (n: number) => Uint8Array = defaultRandom): string {
  const bytes = random(length);
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

function defaultRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
}

export function isValidJoinCode(code: string): boolean {
  return code.length === JOIN_CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch));
}

/** 'projects/p/databases/(default)/documents/messes/abc/daily_meals/x' → 'abc' */
export function messIdFromPath(path: string): string | null {
  const parts = path.split('/');
  const index = parts.indexOf('messes');
  return index >= 0 && parts[index + 1] ? parts[index + 1] : null;
}

export function memberLimitFor(plan: MessPlan): number {
  return PLAN_MEMBER_LIMITS[plan] ?? PLAN_MEMBER_LIMITS.free;
}
