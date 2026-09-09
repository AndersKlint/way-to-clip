/**
 * i18n - language override support.
 *
 * System language works automatically via metadata.json gettext-domain.
 * This module adds the `language` GSettings override (default 'system'):
 * when set to a locale code, lookups are served from the bundled
 * TRANSLATIONS catalogs (generated from locale/*.po) instead of the
 * process locale. This is process-local — unlike GLib.setenv('LANGUAGE'),
 * it never affects the rest of GNOME Shell.
 *
 * Usage in Shell code:
 *   import { gettext as nativeGettext } from 'resource:///.../extension.js';
 *   import { translate } from './src/i18n.js';
 *   const _ = msgid => translate(msgid, nativeGettext);
 *   // at startup: setLanguageOverride(settings.get_string('language'))
 *
 * Restart is required for a full UI refresh (menus/prefs are built once),
 * but popups opened after the change already use the new language since
 * translate() reads the live override on every call.
 */

import { PrefsFields } from '../constants.js';
import { TRANSLATIONS } from './translations.js';

export const SYSTEM_LANGUAGE = 'system';

/** Locale code -> native display name (endonyms, never translated). */
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
};

/** Ordered codes for the prefs ComboRow (system first, then alphabetical). */
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

/** Unknown/empty values fall back to 'system' (never throw on stale dconf). */
export function normalizeLanguage(code) {
    if (typeof code !== 'string' || !code)
        return SYSTEM_LANGUAGE;
    if (code === SYSTEM_LANGUAGE)
        return SYSTEM_LANGUAGE;
    // Accept 'fr-fr' / 'frFR' typos loosely, canonical form wins.
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, code))
        return code;
    const dashed = code.replace('-', '_');
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, dashed))
        return dashed;
    return SYSTEM_LANGUAGE;
}

/** Read the stored override from Gio.Settings (tolerates old schemas/mocks). */
export function getStoredLanguage(settings) {
    try {
        const v = settings?.get_string?.(PrefsFields.LANGUAGE);
        return normalizeLanguage(v);
    } catch (_e) {
        return SYSTEM_LANGUAGE;
    }
}

/** Sync the module-global override from Gio.Settings. */
export function syncOverrideFromSettings(settings) {
    setLanguageOverride(getStoredLanguage(settings));
}

/**
 * Translate msgid under the current override.
 * @param {string} msgid
 * @param {function(string): string} fallback native gettext (system locale)
 */
export function translate(msgid, fallback) {
    if (override === SYSTEM_LANGUAGE)
        return fallback(msgid);
    const catalog = TRANSLATIONS[override];
    const hit = catalog?.[msgid];
    if (typeof hit === 'string' && hit)
        return hit;
    return fallback(msgid);
}

/** Build a local `_` bound to a native gettext (convenience). */
export function makeTranslator(nativeGettext) {
    return msgid => translate(msgid, nativeGettext);
}
