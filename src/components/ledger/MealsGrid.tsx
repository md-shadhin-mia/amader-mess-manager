import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { Doc } from '../../hooks/useCollection';
import type { MealDoc } from '../../hooks/useMonthEntries';
import type { MemberDoc } from '../../hooks/useMembers';
import { daysOfMonth } from '../../lib/dates';
import { planMealWrites, saveMealCells } from '../../lib/ledger';
import { mealCountOf, type MealType } from '../../lib/mealTypes';
import { labelOf } from '../../lib/labels';
import { formatCount, parseAmount } from '../../lib/numbers';
import { mealDocId } from '../../lib/paths';

interface Props {
  messId: string;
  monthId: string;
  members: MemberDoc[];
  mealTypes: MealType[];
  meals: Doc<MealDoc>[];
  disabled?: boolean;
}

const TOTAL = '__total__';

/**
 * Members × days grid for one meal type at a time. Edits accumulate in a
 * draft until "Save changes"; paste fills a block; "fill row" sets a whole
 * month for one member.
 */
export default function MealsGrid({ messId, monthId, members, mealTypes, meals, disabled }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const days = useMemo(() => daysOfMonth(monthId), [monthId]);
  const [typeId, setTypeId] = useState<string>(mealTypes[0]?.id ?? TOTAL);
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (typeId !== TOTAL && !mealTypes.some((m) => m.id === typeId)) setTypeId(mealTypes[0]?.id ?? TOTAL);
  }, [mealTypes, typeId]);

  // Stored meals keyed by doc id; legacy docs without a map count as the first type.
  const stored = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const doc of meals) {
      const data = doc.data;
      map[doc.id] = data.meals ? { ...data.meals } : data.meal_count && mealTypes[0] ? { [mealTypes[0].id]: data.meal_count } : {};
    }
    return map;
  }, [meals, mealTypes]);

  const cell = (uid: string, date: string): Record<string, number> => drafts[mealDocId(uid, date)] ?? stored[mealDocId(uid, date)] ?? {};
  const dirtyCount = Object.keys(drafts).length;

  const setValue = (uid: string, date: string, value: number) => {
    setDrafts((current) => ({ ...current, [mealDocId(uid, date)]: { ...cell(uid, date), [typeId]: value } }));
  };

  const parseCell = (raw: string): number => {
    const text = raw.replace('½', '.5').replace(/^\.5$/, '0.5');
    return parseAmount(text) ?? 0;
  };

  const fillRow = (uid: string) => {
    const raw = prompt(t('fillRowPrompt'), '1');
    if (raw === null) return;
    const value = parseCell(raw);
    setDrafts((current) => {
      const next = { ...current };
      for (const date of days) next[mealDocId(uid, date)] = { ...(next[mealDocId(uid, date)] ?? stored[mealDocId(uid, date)] ?? {}), [typeId]: value };
      return next;
    });
  };

  const onPaste = (rowIndex: number, colIndex: number, e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return; // single value: let the input handle it
    e.preventDefault();
    const rows = text.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
    setDrafts((current) => {
      const next = { ...current };
      rows.forEach((row, r) => {
        const member = members[rowIndex + r];
        if (!member) return;
        row.split('\t').forEach((value, c) => {
          const date = days[colIndex + c];
          if (!date) return;
          const key = mealDocId(member.uid, date);
          next[key] = { ...(next[key] ?? stored[key] ?? {}), [typeId]: parseCell(value) };
        });
      });
      return next;
    });
  };

  const focus = (r: number, c: number) => inputs.current[`${r}-${c}`]?.focus();
  const onKey = (r: number, c: number, e: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[e.key];
    if (!move) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.currentTarget.value.length > 0) return;
    e.preventDefault();
    focus(r + move[0], c + move[1]);
  };

  const save = async () => {
    const cells = Object.entries(drafts).map(([key, mealsMap]) => {
      const [uid, date] = [key.slice(0, key.lastIndexOf('_')), key.slice(key.lastIndexOf('_') + 1)];
      return { uid, date, meals: mealsMap };
    });
    const writes = planMealWrites(cells, new Set(Object.keys(stored)), mealTypes);
    setSaving('0');
    try {
      await saveMealCells(db, messId, writes, (done, total) => setSaving(`${done}/${total}`));
      setDrafts({});
      toast(t('mealsSaved'));
    } catch (err) {
      console.error('Meal grid save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const rowTotal = (uid: string) => days.reduce((sum, date) => sum + (typeId === TOTAL ? mealCountOf(cell(uid, date), mealTypes) : cell(uid, date)[typeId] || 0), 0);
  const colTotal = (date: string) => members.reduce((sum, m) => sum + (typeId === TOTAL ? mealCountOf(cell(m.uid, date), mealTypes) : cell(m.uid, date)[typeId] || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {mealTypes.map((type) => (
            <button key={type.id} onClick={() => setTypeId(type.id)} className={`px-3 py-1.5 text-sm font-medium ${typeId === type.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {labelOf(type, lang)}
            </button>
          ))}
          <button onClick={() => setTypeId(TOTAL)} className={`px-3 py-1.5 text-sm font-medium ${typeId === TOTAL ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {t('weightedTotal')}
          </button>
        </div>
        <p className="text-xs text-gray-500 flex-1">{t('pasteHint')}</p>
        {dirtyCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-700">{t('unsavedChanges')}: {dirtyCount}</span>
            <button onClick={() => setDrafts({})} className="text-sm font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">{t('cancel')}</button>
            <button onClick={save} disabled={disabled || saving !== null} className="text-sm font-medium bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? `${t('loading')} ${saving}` : t('saveChanges')}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="p-2 text-left font-medium sticky left-0 bg-gray-50 z-10 min-w-[8rem]">{t('name')}</th>
              {days.map((date) => (
                <th key={date} className="p-1 font-medium text-center w-10">{Number(date.slice(-2))}</th>
              ))}
              <th className="p-2 font-medium text-right">{t('rowTotal')}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, r) => (
              <tr key={m.uid} className="border-t border-gray-100">
                <td className="p-2 text-gray-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  {m.name}
                  {m.status === 'left' && <span className="ml-1 text-gray-400">({t('leftTag')})</span>}
                </td>
                {days.map((date, c) => {
                  const key = mealDocId(m.uid, date);
                  const value = typeId === TOTAL ? mealCountOf(cell(m.uid, date), mealTypes) : cell(m.uid, date)[typeId] || 0;
                  const dirty = key in drafts;
                  return (
                    <td key={date} className={`p-0 border-l border-gray-50 ${dirty ? 'bg-amber-50' : ''}`}>
                      {typeId === TOTAL ? (
                        <div className="w-10 h-8 flex items-center justify-center text-gray-700">{value ? formatCount(value, lang) : ''}</div>
                      ) : (
                        <input
                          ref={(el) => { inputs.current[`${r}-${c}`] = el; }}
                          inputMode="decimal"
                          disabled={disabled}
                          value={value ? String(value) : ''}
                          onChange={(e) => setValue(m.uid, date, parseCell(e.target.value))}
                          onPaste={(e) => onPaste(r, c, e)}
                          onKeyDown={(e) => onKey(r, c, e)}
                          onFocus={(e) => e.currentTarget.select()}
                          className="w-10 h-8 text-center bg-transparent focus:outline-none focus:bg-blue-50"
                        />
                      )}
                    </td>
                  );
                })}
                <td className="p-2 text-right font-semibold text-gray-900">{formatCount(rowTotal(m.uid), lang)}</td>
                <td className="p-1">
                  {typeId !== TOTAL && !disabled && (
                    <button onClick={() => fillRow(m.uid)} className="text-blue-600 hover:text-blue-800 whitespace-nowrap px-1">{t('fillRow')}</button>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={days.length + 3} className="p-4 text-center text-gray-400">{t('noRows')}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-900">
              <td className="p-2 sticky left-0 bg-gray-50 z-10">{t('dayTotal')}</td>
              {days.map((date) => <td key={date} className="p-1 text-center">{colTotal(date) ? formatCount(colTotal(date), lang) : ''}</td>)}
              <td className="p-2 text-right">{formatCount(members.reduce((s, m) => s + rowTotal(m.uid), 0), lang)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
