import { useState } from 'react';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMess } from '../../contexts/MessContext';
import { mealDocId, messDoc } from '../../lib/paths';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import type { MealDoc } from '../../hooks/useMonthEntries';
import { labelOf } from '../../lib/labels';
import { mealCountOf, type MealType } from '../../lib/mealTypes';
import { formatCount } from '../../lib/numbers';

interface Props {
  uid: string;
  date: string;
  mealTypes: MealType[];
  /** Existing doc for this user+date, if any. */
  current: MealDoc | null;
  disabled?: boolean;
}

const PRESETS = [0, 0.5, 1, 1.5, 2];

function presetLabel(preset: number, lang: 'bn' | 'en'): string {
  const whole = Math.floor(preset);
  const half = preset - whole >= 0.5;
  const wholeText = whole > 0 || !half ? formatCount(whole, lang) : '';
  return `${wholeText}${half ? '½' : ''}`;
}

/**
 * One row per active meal type with one-tap presets. Every tap writes the
 * whole day's meal map to `daily_meals/{uid}_{date}` (one doc per day) and
 * offers an Undo toast.
 */
export default function MealTypeRow({ uid, date, mealTypes, current, disabled }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const messId = useMess().messId ?? '';
  const [saving, setSaving] = useState<string | null>(null);

  // Legacy docs only carry meal_count; show it on the first type so nothing is hidden.
  const currentMeals: Record<string, number> = current?.meals
    ? { ...current.meals }
    : current && mealTypes[0]
      ? { [mealTypes[0].id]: current.meal_count || 0 }
      : {};

  const write = async (next: Record<string, number>, typeId: string) => {
    setSaving(typeId);
    const previous = { ...currentMeals };
    try {
      await setDoc(
        messDoc(db, messId, 'daily_meals', mealDocId(uid, date)),
        { date, user_id: uid, meals: next, meal_count: mealCountOf(next, mealTypes), updated_at: serverTimestamp(), timestamp: serverTimestamp() },
        { merge: true },
      );
      toast(t('mealSaved'), {
        action: {
          label: t('undo'),
          onClick: () => {
            void setDoc(
              messDoc(db, messId, 'daily_meals', mealDocId(uid, date)),
              { date, user_id: uid, meals: previous, meal_count: mealCountOf(previous, mealTypes), updated_at: serverTimestamp() },
              { merge: true },
            );
          },
        },
      });
    } catch (err) {
      console.error('Meal save failed', err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const select = (typeId: string, value: number) => {
    const next = { ...currentMeals, [typeId]: value };
    if (value === 0) delete next[typeId];
    void write(next, typeId);
  };

  const total = mealCountOf(currentMeals, mealTypes);

  return (
    <div className="space-y-3">
      {mealTypes.map((type) => {
        const value = currentMeals[type.id] ?? 0;
        return (
          <div key={type.id} className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              <p className="text-sm font-medium text-gray-800">{labelOf(type, lang)}</p>
              {type.weight !== 1 && <p className="text-xs text-gray-400">× {type.weight}</p>}
            </div>
            <div className="flex-1 grid grid-cols-5 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled || saving === type.id}
                  onClick={() => select(type.id, preset)}
                  className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                    value === preset ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {presetLabel(preset, lang)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-sm text-gray-500 text-right">
        {t('mealsToday')}: <strong className="text-gray-900">{formatCount(total, lang)}</strong>
      </p>
    </div>
  );
}
