import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

export type Locale = 'en' | 'fr';

const dictionaries: Record<Locale, typeof en> = { en, fr };

export function getDictionary(locale: Locale = 'en') {
  return dictionaries[locale] ?? dictionaries.en;
}

export function t(key: string, locale: Locale = 'en'): string {
  const dict = getDictionary(locale);
  const keys = key.split('.');

  let current: Record<string, unknown> = dict;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k] as Record<string, unknown>;
    } else {
      return key;
    }
  }

  return typeof current === 'string' ? current : key;
}
