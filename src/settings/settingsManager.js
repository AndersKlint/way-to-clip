import { PrefsFields } from '../common/constants.js';
import * as LocalShortcuts from '../cursorPopup/localShortcutUtils.js';

export const SYSTEM_LANGUAGE = 'system';

// tolerate old schemas missing the key
function readLanguage(settings) {
    try {
        const v = settings.get_string(PrefsFields.LANGUAGE);
        return typeof v === 'string' && v ? v : SYSTEM_LANGUAGE;
    } catch (_e) {
        return SYSTEM_LANGUAGE;
    }
}

function readLocalShortcuts(settings) {
    const out = {};
    for (const [action, key] of Object.entries(LocalShortcuts.LOCAL_SHORTCUT_PREF_KEYS))
        out[action] = settings.get_strv(key);
    return out;
}

export class SettingsManager {
    #settings;
    // manual signal-ID tracking: plain JS class, no GObject connectObject/disconnectObject
    #changedIds = [];

    constructor(settings) {
        this.#settings = settings;
    }

    get gio() {
        return this.#settings;
    }

    snapshot() {
        const s = this.#settings;
        let imagePreviewSize = 96;
        try {
            imagePreviewSize = s.get_int(PrefsFields.IMAGE_PREVIEW_SIZE);
        } catch (_e) { /* old schema, keep default */ }
        return {
            maxRegistryLength: s.get_int(PrefsFields.HISTORY_SIZE),
            cacheOnlyFavorite: s.get_boolean(PrefsFields.CACHE_ONLY_FAVORITE),
            moveItemFirst: s.get_boolean(PrefsFields.MOVE_ITEM_FIRST),
            confirmOnClear: s.get_boolean(PrefsFields.CONFIRM_ON_CLEAR),
            enableKeybinding: s.get_boolean(PrefsFields.ENABLE_KEYBINDING),
            clearOnBoot: s.get_boolean(PrefsFields.CLEAR_ON_BOOT),
            keepSelectedOnClear: s.get_boolean(PrefsFields.KEEP_SELECTED_ON_CLEAR),
            shouldCacheImages: s.get_boolean(PrefsFields.SHOULD_CACHE_IMAGES),
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
            showShortcutHints: s.get_boolean(PrefsFields.SHOW_SHORTCUT_HINTS),
            localShortcuts: readLocalShortcuts(s),
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
        for (const id of this.#changedIds)
            this.#settings.disconnect(id);
        this.#changedIds = [];
        this.#settings = null;
    }
}
