/**
 * Minimal Firestore REST client (v1) for use inside the Worker.
 * https://firebase.google.com/docs/firestore/reference/rest
 */

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export interface FirestoreDocument<T = Record<string, unknown>> {
  /** Last path segment of the document name, i.e. the document id. */
  id: string;
  name: string;
  data: T;
}

export class FirestoreClient {
  private readonly base: string;

  constructor(private readonly projectId: string, private readonly accessToken: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Firestore ${init.method || 'GET'} ${path} failed (${response.status}): ${await response.text()}`);
    }
    return response;
  }

  /** Runs a structured query against one top-level collection. */
  async query<T = Record<string, unknown>>(
    collection: string,
    where?: { field: string; op: 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN'; value: string | number | boolean },
    limit = 500,
  ): Promise<FirestoreDocument<T>[]> {
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: collection }], limit };
    if (where) {
      structuredQuery.where = {
        fieldFilter: { field: { fieldPath: where.field }, op: where.op, value: toFirestoreValue(where.value) },
      };
    }
    const response = await this.request(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
    const rows = (await response.json()) as { document?: { name: string; fields?: Record<string, FirestoreValue> } }[];
    return rows
      .filter((row) => row.document)
      .map((row) => ({
        id: row.document!.name.split('/').pop()!,
        name: row.document!.name,
        data: decodeFields(row.document!.fields) as T,
      }));
  }

  async get<T = Record<string, unknown>>(path: string): Promise<FirestoreDocument<T> | null> {
    const response = await fetch(`${this.base}/${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore GET ${path} failed (${response.status}): ${await response.text()}`);
    const document = (await response.json()) as { name: string; fields?: Record<string, FirestoreValue> };
    return { id: document.name.split('/').pop()!, name: document.name, data: decodeFields(document.fields) as T };
  }

  /** Updates only the given fields, leaving the rest of the document untouched. */
  async update(path: string, fields: Record<string, unknown>): Promise<void> {
    const mask = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
    await this.request(`/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(fields) }) });
  }

  async create(collection: string, fields: Record<string, unknown>, id?: string): Promise<void> {
    const suffix = id ? `?documentId=${encodeURIComponent(id)}` : '';
    await this.request(`/${collection}${suffix}`, { method: 'POST', body: JSON.stringify({ fields: encodeFields(fields) }) });
  }
}

export function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Cannot encode value of type ${typeof value} for Firestore`);
}

export function encodeFields(fields: Record<string, unknown>): Record<string, FirestoreValue> {
  const out: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = toFirestoreValue(value);
  return out;
}

export function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  return undefined;
}

export function decodeFields(fields?: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = fromFirestoreValue(value);
  return out;
}
