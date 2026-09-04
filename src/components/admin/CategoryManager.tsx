import { useState, type FormEvent } from 'react';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { COST_CATEGORIES_COLLECTION, type CostCategory, type CostTiming, type SplitRule } from '../../lib/costCategories';
import { slugify } from '../../lib/labels';

interface Props {
  categories: CostCategory[];
}

type Draft = Pick<CostCategory, 'label_bn' | 'label_en' | 'split_rule' | 'timing'>;

/**
 * Manager UI for the dynamic cost category list: add, rename (bn/en), change
 * split rule or prepaid/postpaid timing, reorder, deactivate, delete.
 */
export default function CategoryManager({ categories }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState<Draft>({ label_bn: '', label_en: '', split_rule: 'equal', timing: 'postpaid' });
  const [busy, setBusy] = useState<string | null>(null);

  const draftOf = (category: CostCategory): Draft => drafts[category.id] ?? category;
  const isDirty = (category: CostCategory) => {
    const d = drafts[category.id];
    return Boolean(d) && (d.label_bn !== category.label_bn || d.label_en !== category.label_en || d.split_rule !== category.split_rule || d.timing !== category.timing);
  };
  const setDraft = (category: CostCategory, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [category.id]: { ...draftOf(category), ...patch } }));

  const save = async (category: CostCategory) => {
    const draft = draftOf(category);
    if (!draft.label_bn.trim() || !draft.label_en.trim()) {
      toast(t('labelRequired'), { tone: 'error' });
      return;
    }
    setBusy(category.id);
    try {
      await updateDoc(doc(db, COST_CATEGORIES_COLLECTION, category.id), {
        label_bn: draft.label_bn.trim(),
        label_en: draft.label_en.trim(),
        split_rule: category.builtin ? category.split_rule : draft.split_rule,
        timing: draft.timing,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[category.id];
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

  const toggleActive = async (category: CostCategory) => {
    await updateDoc(doc(db, COST_CATEGORIES_COLLECTION, category.id), { active: !category.active });
  };

  const move = async (index: number, direction: -1 | 1) => {
    const other = categories[index + direction];
    const current = categories[index];
    if (!other) return;
    const batch = writeBatch(db);
    // Ensure distinct orders even when two rows share a value.
    const a = current.sort_order;
    const b = other.sort_order === a ? a + direction : other.sort_order;
    batch.update(doc(db, COST_CATEGORIES_COLLECTION, current.id), { sort_order: b });
    batch.update(doc(db, COST_CATEGORIES_COLLECTION, other.id), { sort_order: a });
    await batch.commit();
  };

  const remove = async (category: CostCategory) => {
    if (category.builtin) return;
    if (!confirm(`${t('deleteCategoryConfirm')} (${category.label_en})`)) return;
    await deleteDoc(doc(db, COST_CATEGORIES_COLLECTION, category.id));
    toast(t('deleted'));
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const label_en = newItem.label_en.trim();
    const label_bn = newItem.label_bn.trim() || label_en;
    if (!label_en) {
      toast(t('labelRequired'), { tone: 'error' });
      return;
    }
    let id = slugify(label_en) || `cat_${Date.now()}`;
    if (categories.some((c) => c.id === id)) id = `${id}_${Date.now().toString(36)}`;
    const sort_order = (categories.at(-1)?.sort_order ?? 0) + 10;
    setBusy('new');
    try {
      await setDoc(doc(db, COST_CATEGORIES_COLLECTION, id), { label_bn, label_en, split_rule: newItem.split_rule, timing: newItem.timing, sort_order, active: true });
      setNewItem({ label_bn: '', label_en: '', split_rule: 'equal', timing: 'postpaid' });
      setAdding(false);
      toast(t('categoryAdded'));
    } catch (err) {
      console.error(err);
      toast(t('saveFailed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const inputClass = 'w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  const splitOptions: { value: SplitRule; label: string }[] = [
    { value: 'equal', label: t('splitEqual') },
    { value: 'by_meals', label: t('splitByMeals') },
    { value: 'per_member', label: t('splitPerMember') },
  ];
  const timingOptions: { value: CostTiming; label: string }[] = [
    { value: 'prepaid', label: t('timingPrepaid') },
    { value: 'postpaid', label: t('timingPostpaid') },
  ];

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start gap-4 mb-1">
        <h2 className="text-lg font-medium text-gray-900">{t('costCategories')}</h2>
        <button onClick={() => setAdding((v) => !v)} className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
          {adding ? t('cancel') : `+ ${t('addCategory')}`}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t('costCategoriesHint')}</p>

      {adding && (
        <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
          <input className={inputClass} placeholder={t('labelBn')} value={newItem.label_bn} onChange={(e) => setNewItem({ ...newItem, label_bn: e.target.value })} />
          <input className={inputClass} placeholder={t('labelEn')} value={newItem.label_en} onChange={(e) => setNewItem({ ...newItem, label_en: e.target.value })} required />
          <select className={inputClass} value={newItem.split_rule} onChange={(e) => setNewItem({ ...newItem, split_rule: e.target.value as SplitRule })}>
            {splitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={inputClass} value={newItem.timing} onChange={(e) => setNewItem({ ...newItem, timing: e.target.value as CostTiming })}>
            {timingOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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
              <th className="p-2 font-medium">{t('splitRule')}</th>
              <th className="p-2 font-medium">{t('timing')}</th>
              <th className="p-2 font-medium">{t('active')}</th>
              <th className="p-2 font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category, index) => {
              const draft = draftOf(category);
              return (
                <tr key={category.id} className={`border-b border-gray-100 last:border-0 ${category.active ? '' : 'opacity-50'}`}>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="px-1 text-gray-500 disabled:opacity-30" aria-label="up">▲</button>
                    <button onClick={() => move(index, 1)} disabled={index === categories.length - 1} className="px-1 text-gray-500 disabled:opacity-30" aria-label="down">▼</button>
                  </td>
                  <td className="p-2"><input className={inputClass} value={draft.label_bn} onChange={(e) => setDraft(category, { label_bn: e.target.value })} /></td>
                  <td className="p-2"><input className={inputClass} value={draft.label_en} onChange={(e) => setDraft(category, { label_en: e.target.value })} /></td>
                  <td className="p-2">
                    {category.builtin ? (
                      <span className="text-xs text-gray-500">{t('splitPerMember')} · {t('fromProfile')}</span>
                    ) : (
                      <select className={inputClass} value={draft.split_rule} onChange={(e) => setDraft(category, { split_rule: e.target.value as SplitRule })}>
                        {splitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    <select className={inputClass} value={draft.timing} onChange={(e) => setDraft(category, { timing: e.target.value as CostTiming })}>
                      {timingOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={category.active} onChange={() => toggleActive(category)} />
                    </label>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {isDirty(category) && (
                      <button onClick={() => save(category)} disabled={busy === category.id} className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 mr-2">
                        {t('save')}
                      </button>
                    )}
                    {!category.builtin && (
                      <button onClick={() => remove(category)} className="text-xs font-medium text-red-600 hover:text-red-800">
                        {t('delete')}
                      </button>
                    )}
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
