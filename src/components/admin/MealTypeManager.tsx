import { useState, type FormEvent } from 'react';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { MEAL_TYPES_COLLECTION, type MealType } from '../../lib/mealTypes';
import { slugify } from '../../lib/labels';
import { parseAmount } from '../../lib/numbers';

interface Props {
  mealTypes: MealType[];
}

type Draft = { label_bn: string; label_en: string; weight: string };

/** Manager UI for the dynamic meal type list (lunch, dinner, ...). */
export default function MealTypeManager({ mealTypes }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState<Draft>({ label_bn: '', label_en: '', weight: '1' });
  const [busy, setBusy] = useState<string | null>(null);

  const draftOf = (type: MealType): Draft => drafts[type.id] ?? { label_bn: type.label_bn, label_en: type.label_en, weight: String(type.weight) };
  const isDirty = (type: MealType) => {
    const d = drafts[type.id];
    return Boolean(d) && (d.label_bn !== type.label_bn || d.label_en !== type.label_en || Number(d.weight) !== type.weight);
  };
  const setDraft = (type: MealType, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [type.id]: { ...draftOf(type), ...patch } }));

  const save = async (type: MealType) => {
    const draft = draftOf(type);
    const weight = parseAmount(draft.weight);
    if (!draft.label_bn.trim() || !draft.label_en.trim() || weight === null || weight <= 0) {
      toast(t('labelRequired'), { tone: 'error' });
      return;
    }
    setBusy(type.id);
    try {
      await updateDoc(doc(db, MEAL_TYPES_COLLECTION, type.id), { label_bn: draft.label_bn.trim(), label_en: draft.label_en.trim(), weight });
      setDrafts((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      toast(t('saved'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const current = mealTypes[index];
    const other = mealTypes[index + direction];
    if (!other) return;
    const batch = writeBatch(db);
    const a = current.sort_order;
    const b = other.sort_order === a ? a + direction : other.sort_order;
    batch.update(doc(db, MEAL_TYPES_COLLECTION, current.id), { sort_order: b });
    batch.update(doc(db, MEAL_TYPES_COLLECTION, other.id), { sort_order: a });
    await batch.commit();
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const label_en = newItem.label_en.trim();
    const label_bn = newItem.label_bn.trim() || label_en;
    const weight = parseAmount(newItem.weight);
    if (!label_en || weight === null || weight <= 0) {
      toast(t('labelRequired'), { tone: 'error' });
      return;
    }
    let id = slugify(label_en) || `meal_${Date.now()}`;
    if (mealTypes.some((m) => m.id === id)) id = `${id}_${Date.now().toString(36)}`;
    setBusy('new');
    try {
      await setDoc(doc(db, MEAL_TYPES_COLLECTION, id), { label_bn, label_en, weight, sort_order: (mealTypes.at(-1)?.sort_order ?? 0) + 10, active: true });
      setNewItem({ label_bn: '', label_en: '', weight: '1' });
      setAdding(false);
      toast(t('mealTypeAdded'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (type: MealType) => {
    if (!confirm(`${t('deleteMealTypeConfirm')} (${type.label_en})`)) return;
    await deleteDoc(doc(db, MEAL_TYPES_COLLECTION, type.id));
    toast(t('deleted'));
  };

  const inputClass = 'w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start gap-4 mb-1">
        <h2 className="text-lg font-medium text-gray-900">{t('mealTypes')}</h2>
        <button onClick={() => setAdding((v) => !v)} className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
          {adding ? t('cancel') : `+ ${t('addMealType')}`}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t('mealTypesHint')}</p>

      {adding && (
        <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
          <input className={inputClass} placeholder={t('labelBn')} value={newItem.label_bn} onChange={(e) => setNewItem({ ...newItem, label_bn: e.target.value })} />
          <input className={inputClass} placeholder={t('labelEn')} value={newItem.label_en} onChange={(e) => setNewItem({ ...newItem, label_en: e.target.value })} required />
          <input className={inputClass} inputMode="decimal" placeholder={t('mealWeight')} value={newItem.weight} onChange={(e) => setNewItem({ ...newItem, weight: e.target.value })} />
          <button type="submit" disabled={busy === 'new'} className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {t('add')}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <th className="p-2 font-medium w-16">{t('order')}</th>
              <th className="p-2 font-medium">{t('labelBn')}</th>
              <th className="p-2 font-medium">{t('labelEn')}</th>
              <th className="p-2 font-medium">{t('mealWeight')}</th>
              <th className="p-2 font-medium">{t('active')}</th>
              <th className="p-2 font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {mealTypes.map((type, index) => {
              const draft = draftOf(type);
              return (
                <tr key={type.id} className={`border-b border-gray-100 last:border-0 ${type.active ? '' : 'opacity-50'}`}>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="px-1 text-gray-500 disabled:opacity-30" aria-label="up">▲</button>
                    <button onClick={() => move(index, 1)} disabled={index === mealTypes.length - 1} className="px-1 text-gray-500 disabled:opacity-30" aria-label="down">▼</button>
                  </td>
                  <td className="p-2"><input className={inputClass} value={draft.label_bn} onChange={(e) => setDraft(type, { label_bn: e.target.value })} /></td>
                  <td className="p-2"><input className={inputClass} value={draft.label_en} onChange={(e) => setDraft(type, { label_en: e.target.value })} /></td>
                  <td className="p-2"><input className={`${inputClass} w-20`} inputMode="decimal" value={draft.weight} onChange={(e) => setDraft(type, { weight: e.target.value })} /></td>
                  <td className="p-2"><input type="checkbox" checked={type.active} onChange={() => updateDoc(doc(db, MEAL_TYPES_COLLECTION, type.id), { active: !type.active })} /></td>
                  <td className="p-2 whitespace-nowrap">
                    {isDirty(type) && (
                      <button onClick={() => save(type)} disabled={busy === type.id} className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 mr-2">
                        {t('save')}
                      </button>
                    )}
                    <button onClick={() => remove(type)} className="text-xs font-medium text-red-600 hover:text-red-800">{t('delete')}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
