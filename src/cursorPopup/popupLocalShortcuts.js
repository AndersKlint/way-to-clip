import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { makeTranslator } from '../common/i18n.js';
import * as LocalShortcuts from './localShortcutUtils.js';

const _ = makeTranslator(nativeGettext);

// configured key bindings plus the footer hint labels that advertise them
export class PopupLocalShortcuts {
    #shortcutStrings = {};
    #bindings = {};
    #showHints = true;
    #favoritesEnabled = true;
    #uiBuilder = null;

    constructor({ uiBuilder } = {}) {
        this.#uiBuilder = uiBuilder ?? null;
        for (const [action, list] of Object.entries(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS)) {
            this.#shortcutStrings[action] = [...list];
            this.#bindings[action] = LocalShortcuts.parseAcceleratorList(list);
        }
    }

    applySettings(prefs) {
        for (const action of Object.keys(LocalShortcuts.LOCAL_SHORTCUT_PREF_KEYS)) {
            const list = prefs.localShortcuts?.[action];
            this.#shortcutStrings[action] = Array.isArray(list)
                ? [...list]
                : [...LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS[action]];
            this.#bindings[action] =
                LocalShortcuts.parseAcceleratorList(this.#shortcutStrings[action]);
        }
        this.#showHints = prefs.showShortcutHints;
        this.#favoritesEnabled = prefs.favoritesEnabled ?? true;
    }

    isLocalShortcut(action, event) {
        return LocalShortcuts.matchesShortcut(event, this.#bindings[action]);
    }

    isBound(action) {
        return (this.#bindings[action]?.length ?? 0) > 0;
    }

    // quick select slot 0-9, or -1 when no quick slot matches the event
    matchQuickSelectSlot(event) {
        for (let i = 0; i < LocalShortcuts.QUICK_SELECT_ORDER.length; i++) {
            if (this.isLocalShortcut(LocalShortcuts.QUICK_SELECT_ORDER[i], event))
                return i;
        }
        return -1;
    }

    quickSlotDisplay(index) {
        const action = LocalShortcuts.QUICK_SELECT_ORDER[index];
        if (!action || !this.isBound(action))
            return '';
        return this.formatForHint(action);
    }

    get showHints() {
        return this.#showHints;
    }

    // first binding is what tooltips advertise, even when several are bound
    formatForHint(action) {
        const raw = this.#shortcutStrings[action]?.[0];
        if (!raw)
            return _('Disabled');
        return LocalShortcuts.formatAccelerator(raw);
    }

    // footer hint labels + tooltips, hidden when hints off or action unbound
    syncHints(ui) {
        if (!ui)
            return;
        this.#applyHint(ui.searchHint, ui.searchHintLabel,
            'search', ' = %s', _('Toggle search (%s)'));
        this.#applyHint(ui.privateModeHint, ui.privateModeHintLabel,
            'privateMode', ' = %s', _('Toggle private mode (%s)'));
        if (ui.favoriteHint) {
            if (!this.#favoritesEnabled)
                ui.favoriteHint.visible = false;
            else
                this.#applyHint(ui.favoriteHint, ui.favoriteHintLabel,
                    'toggleFavorite', ' = %s', _('Toggle favorite (%s)'));
        }
        this.#applyHint(ui.deleteHint, ui.deleteHintLabel,
            'deleteEntry', ' = %s', _('Delete selected entry (%s)'));
    }

    #applyHint(hintActor, labelActor, action, labelFormat, tooltipFormat) {
        if (!hintActor || !labelActor)
            return;
        const bound = this.isBound(action);
        hintActor.visible = this.#showHints !== false && bound;
        if (!bound)
            return;
        const display = this.formatForHint(action);
        labelActor.set_text(labelFormat.format(display));
        const tooltipText = tooltipFormat.format(display);
        if (this.#uiBuilder)
            this.#uiBuilder.setHoverTooltipText(hintActor, tooltipText);
    }
}
