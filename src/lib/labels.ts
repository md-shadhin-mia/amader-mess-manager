import type { Language } from '../i18n/translations';

export interface Labelled {
  label_bn: string;
  label_en: string;
}

export function labelOf(item: Labelled, lang: Language): string {
  return (lang === 'bn' ? item.label_bn : item.label_en) || item.label_en || item.label_bn;
}

/** Stable document id from an English label: 'Cable TV' → 'cable_tv'. */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
