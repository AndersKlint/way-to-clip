/**
 * SettingsManager - typed wrapper around Gio.Settings.
 *
 * Replaces the module-level `let MAX_REGISTRY_LENGTH ...` globals in
 * extension.js. One instance per Indicator; exposes a snapshot object
 * and a single `changed` subscription point so callers don't each
 * connect to GSettings directly.
 */

import { PrefsFields } from '../constants.js';

export const SYSTEM_LANGUAGE = 'system';

/**
 * Read the language override, tolerating old schemas without the key
 * (same pattern as IMAGE_PREVIEW_SIZE above).
 */
function readLanguage(settings) {
    try {
        const v = settings.get_string(PrefsFields.LANGUAGE);
        return typeof v === 'string' && v ? v : SYSTEM_LANGUAGE;
    } catch (_e) {
        return SYSTEM_LANGUAGE;
    }
}

export class SettingsManager {
    #settings;
    #changedIds = [];

    constructor(settings) {
        this.#settings = settings;
    }

    get gio() {
        return this.#settings;
    }

    /** Plain snapshot of every key WayToClip cares about. */
    snapshot() {
        const s = this.#settings;
        let imagePreviewSize = 96;
        try {
            imagePreviewSize = s.get_int(PrefsFields.IMAGE_PREVIEW_SIZE);
        } catch (_e) { /* old schema without the key: keep default */ }
        return {
            maxRegistryLength: s.get_int(PrefsFields.HISTORY_SIZE),
            cacheOnlyFavorite: s.get_boolean(PrefsFields.CACHE_ONLY_FAVORITE),
            moveItemFirst: s.get_boolean(PrefsFields.MOVE_ITEM_FIRST),
            confirmOnClear: s.get_boolean(PrefsFields.CONFIRM_ON_CLEAR),
            enableKeybinding: s.get_boolean(PrefsFields.ENABLE_KEYBINDING),
            clearOnBoot: s.get_boolean(PrefsFields.CLEAR_ON_BOOT),
            keepSelectedOnClear: s.get_boolean(PrefsFields.KEEP_SELECTED_ON_CLEAR),
            cacheImages: s.get_boolean(PrefsFields.CACHE_IMAGES),
            excludedApps: s.get_strv(PrefsFields.EXCLUDED_APPS),
            terminalApps: s.get_strv(PrefsFields.TERMINAL_APPS),
            clearHistoryOnInterval: s.get_boolean(PrefsFields.CLEAR_HISTORY_ON_INTERVAL),
            clearHistoryInterval: s.get_int(PrefsFields.CLEAR_HISTORY_INTERVAL),
            nextHistoryClear: s.get_int(PrefsFields.NEXT_HISTORY_CLEAR),
            popupPositionMode: s.get_int(PrefsFields.POPUP_POSITION_MODE),
            maxPopupPages: s.get_int(PrefsFields.MAX_POPUP_PAGES),
            limitPopupPages: s.get_boolean(PrefsFields.LIMIT_POPUP_PAGES),
            autoPaste: s.get_boolean(PrefsFields.AUTO_PASTE),
            caseSensitiveSearch: s.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH),
            regexSearch: s.get_boolean(PrefsFields.REGEX_SEARCH),
            imagePreviewSize,
            language: readLanguage(s),
        };
    }

    get(key) {
        return this.snapshot()[key];
    }

    setNextHistoryClear(timestamp) {
        this.#settings.set_int(PrefsFields.NEXT_HISTORY_CLEAR, timestamp);
    }

    /**
     * Subscribe to any settings change. Returns a disconnect function.
     * Prefer key-specific subscription via `onKey` to avoid triple-fetch.
     */
    onAnyChange(callback) {
        const id = this.#settings.connect('changed', callback);
        this.#changedIds.push(id);
        return () => {
            this.#settings.disconnect(id);
            this.#changedIds = this.#changedIds.filter(x => x !== id);
        };
    }

    onKey(field, callback) {
        const id = this.#settings.connect(`changed::${field}`, callback);
        this.#changedIds.push(id);
        return () => {
            this.#settings.disconnect(id);
            this.#changedIds = this.#changedIds.filter(x => x !== id);
        };
    }

    destroy() {
        for (const id of this.#changedIds) {
            try {
                this.#settings.disconnect(id);
            } catch (_e) { /* already gone */ }
        }
        this.#changedIds = [];
        this.#settings = null;
    }
}
