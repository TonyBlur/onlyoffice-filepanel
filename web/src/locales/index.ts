import { useState, useCallback, useEffect } from 'react';
import zhCN from './zh';
import enUS from './en';

const LANG_KEY = 'preferred_language';
const DEFAULT_LANG = 'zh';

type LocaleDict = Record<string, string | Record<string, string>>;

const translations: Record<string, LocaleDict> = { zh: zhCN as LocaleDict, en: enUS as LocaleDict };

export interface TranslationHook {
  t: (key: string) => string;
  lang: string;
  setLang: (lang: string) => void;
  toggleLang: () => void;
}

export function useTranslation(): TranslationHook {
  const [lang, setLang] = useState<string>(() => localStorage.getItem(LANG_KEY) || DEFAULT_LANG);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const t = useCallback((key: string): string => {
    const dict = translations[lang];
    if (!dict) return key;

    // Try dot-notation lookup: 'theme.light' → dict['theme']['light']
    if (key.includes('.')) {
      const keys = key.split('.');
      let value: unknown = dict;
      for (const k of keys) {
        if (typeof value === 'object' && value !== null && k in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
      if (typeof value === 'string') return value;
    }

    // Flat key lookup
    const flatValue = dict[key];
    if (typeof flatValue === 'string') return flatValue;

    return key;
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang(l => l === 'zh' ? 'en' : 'zh');
  }, []);

  return { t, lang, setLang, toggleLang };
}
