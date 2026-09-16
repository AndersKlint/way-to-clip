// language override ('system' = native gettext, else bundled catalogs)
// process-local only, never touches the rest of the shell

import { PrefsFields } from './constants.js';
import { TRANSLATIONS } from './translations.js';

export const SYSTEM_LANGUAGE = 'system';

export const LANGUAGE_LABELS = {
    ar: 'العربية',
    ca: 'Català',
    cs: 'Čeština',
    de: 'Deutsch',
    el: 'Ελληνικά',
    es: 'Español',
    eu: 'Euskara',
    fa: 'فارسی',
    fi: 'Suomi',
    fr_FR: 'Français',
    hu: 'Magyar',
    it: 'Italiano',
    ja: '日本語',
    kn: 'ಕನ್ನಡ',
    ko: '한국어',
    nl: 'Nederlands',
    oc: 'Occitan',
    pl: 'Polski',
    pt_BR: 'Português (Brasil)',
    ru: 'Русский',
    sk: 'Slovenčina',
    tr: 'Türkçe',
    uk: 'Українська',
    zh_CN: '简体中文',
    zh_TW: '繁體中文（臺灣）',
};

export const AVAILABLE_LANGUAGES = [
    SYSTEM_LANGUAGE,
    ...Object.keys(LANGUAGE_LABELS).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())),
];

let override = SYSTEM_LANGUAGE;

export function setLanguageOverride(value) {
    override = normalizeLanguage(value);
}

export function getLanguageOverride() {
    return override;
}

export function isKnownLanguage(code) {
    return (
        code === SYSTEM_LANGUAGE ||
        Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, code)
    );
}

// junk in -> 'system', never throws on stale dconf
export function normalizeLanguage(code) {
    if (typeof code !== 'string' || !code)
        return SYSTEM_LANGUAGE;
    if (code === SYSTEM_LANGUAGE)
        return SYSTEM_LANGUAGE;
    // be lenient with fr-fr / frFR typos
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, code))
        return code;
    const dashed = code.replace('-', '_');
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, dashed))
        return dashed;
    return SYSTEM_LANGUAGE;
}

export function getStoredLanguage(settings) {
    try {
        return normalizeLanguage(settings.get_string(PrefsFields.LANGUAGE));
    } catch (_e) {
        return SYSTEM_LANGUAGE;
    }
}

export function syncOverrideFromSettings(settings) {
    setLanguageOverride(getStoredLanguage(settings));
}

export function resetLanguageOverride() {
    override = SYSTEM_LANGUAGE;
}

export function translate(msgid, fallback) {
    if (override === SYSTEM_LANGUAGE)
        return fallback(msgid);
    const catalog = TRANSLATIONS[override];
    const hit = catalog?.[msgid];
    if (typeof hit === 'string' && hit)
        return hit;
    return fallback(msgid);
}

export function makeTranslator(nativeGettext) {
    return msgid => translate(msgid, nativeGettext);
}
