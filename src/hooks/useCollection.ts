import { useEffect, useState } from 'react';
import { onSnapshot, type Query } from 'firebase/firestore';

export interface Doc<T> {
  id: string;
  data: T;
}

/**
 * Subscribes to a Firestore query for the lifetime of the component.
 * `key` must change whenever the query does (Firestore Query objects are not
 * referentially stable), otherwise the subscription would be re-created on
 * every render.
 */
export function useCollection<T>(makeQuery: () => Query | null, key: string): { docs: Doc<T>[]; loading: boolean; error: string | null } {
  const [docs, setDocs] = useState<Doc<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = makeQuery();
    if (!q) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setDocs(snapshot.docs.map((d) => ({ id: d.id, data: d.data() as T })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Firestore subscription failed:', err);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { docs, loading, error };
}
