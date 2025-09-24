import { useState, useCallback, useEffect } from 'react'
import zhCN from './zh'
import enUS from './en'

const LANG_KEY = 'preferred_language'
const DEFAULT_LANG = 'zh'
const translations = { zh: zhCN, en: enUS }

export function useTranslation() {
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || DEFAULT_LANG)

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  const t = useCallback((key) => {
    const keys = key.split('.')
    let value = translations[lang]
    for (const k of keys) {
      value = value?.[k]
      if (!value) break
    }
    return value || key
  }, [lang])

  const toggleLang = useCallback(() => {
    setLang(l => l === 'zh' ? 'en' : 'zh')
  }, [])

  return { t, lang, toggleLang }
}