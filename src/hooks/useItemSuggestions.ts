import { limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { messCol } from '../lib/paths';
import { useCollection } from './useCollection';
import type { ExpenseDoc } from './useMonthEntries';

/**
 * Bazar item names seen in recent entries (everyone's), most frequent first,
 * for the autocomplete on the member form.
 */
export function useItemSuggestions(max = 40): string[] {
  const { messId } = useMess();
  const { docs } = useCollection<ExpenseDoc>(
    () => (messId ? query(messCol(db, messId, 'bazar_expenses'), orderBy('timestamp', 'desc'), limit(150)) : null),
    `bazar_expenses:recent:${messId}`,
  );
  const counts = new Map<string, { display: string; n: number }>();
  for (const d of docs) {
    for (const raw of String(d.data.items_description || '').split(/[,،]/)) {
      const display = raw.trim().replace(/\s+/g, ' ');
      if (display.length < 2) continue;
      const key = display.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.n += 1;
      else counts.set(key, { display, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.display.localeCompare(b.display)).slice(0, max).map((e) => e.display);
}
