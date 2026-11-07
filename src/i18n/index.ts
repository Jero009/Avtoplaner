import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import sl from './sl.json';
import en from './en.json';
import { storedLanguage } from '../utils/preferences';

void i18n.use(initReactI18next).init({
  resources: {
    sl: { translation: sl },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: 'sl',
  interpolation: { escapeValue: false },
});

export default i18n;
