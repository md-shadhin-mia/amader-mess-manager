import type { TranslationKey } from '../i18n/translations';

/** Maps a settlement warning code (possibly with ':detail') to a translation key and detail. */
export function describeWarning(code: string): { key: TranslationKey; detail?: string } {
  const [head, ...rest] = code.split(':');
  const detail = rest.length ? rest.join(':') : undefined;
  const map: Record<string, TranslationKey> = {
    NO_MEALS: 'warnNoMeals',
    UNALLOCATED_BAZAR: 'warnNoMeals',
    UNKNOWN_MEMBER: 'warnUnknownMember',
    INACTIVE_CATEGORY_HAS_AMOUNT: 'warnInactiveCategory',
    UNALLOCATED_CATEGORY: 'warnUnallocatedCategory',
    INVALID_MEAL_COUNT: 'warnInvalidMeal',
    NEGATIVE_EXPENSE: 'warnNegative',
    NEGATIVE_PAYMENT: 'warnNegative',
    UNKNOWN_MEAL_TYPE: 'warnUnknownMealType',
  };
  return { key: map[head] ?? 'warnGeneric', detail };
}
