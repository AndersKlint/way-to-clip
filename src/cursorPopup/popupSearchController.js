import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { makeTranslator } from '../common/i18n.js';

const _ = makeTranslator(nativeGettext);

// search mode, toggle buttons, and filtering. Reads/writes the popup's
// item list through the facade and renders through it.
export class PopupSearchController {
    #model;
    #shortcuts;
    #uiBuilder;
    #handlers;
    #popup;
    #selection = null;
    #placer = null;
    #isSearchMode = false;
    #query = '';

    constructor({ model, shortcuts, uiBuilder, handlers, popup }) {
        this.#model = model;
        this.#shortcuts = shortcuts;
        this.#uiBuilder = uiBuilder;
        this.#handlers = handlers;
        this.#popup = popup;
    }

    // wired after construction, selection needs this controller too
    setSelection(selection) {
        this.#selection = selection;
    }

    // wired after construction, toggleSearch re-anchors through the placer
    setPlacer(placer) {
        this.#placer = placer;
    }

    get isSearchMode() {
        return this.#isSearchMode;
    }

    get query() {
        return this.#query;
    }

    // fresh state for a new open. UI gets built right after
    reset() {
        this.#isSearchMode = false;
        this.#query = '';
    }

    applySettings(prefs) {
        this.#model.applySettings(
            prefs.caseSensitiveSearch,
            prefs.regexSearch);
    }

    toggleSearch() {
        const ui = this.#popup.ui;
        this.#isSearchMode = !this.#isSearchMode;
        if (ui.searchBar)
            ui.searchBar.visible = this.#isSearchMode;
        else if (ui.searchEntry)
            ui.searchEntry.visible = this.#isSearchMode;
        if (this.#isSearchMode) {
            this.refreshToggleButtons();
            global.stage.set_key_focus(ui.searchEntry.get_clutter_text());
            // search bar height changed, re-anchor now + verify after layout
            this.#placer.reposition();
            this.#placer.scheduleReposition();
        } else {
            this.exitSearch();
        }
    }

    exitSearch() {
        const ui = this.#popup.ui;
        this.#isSearchMode = false;
        this.#hideSearchTooltip();
        if (ui.searchBar) {
            ui.searchBar.visible = false;
            // bar controls visibility so toggles come back together next time
            if (ui.searchEntry)
                ui.searchEntry.set_text('');
        } else if (ui.searchEntry) {
            ui.searchEntry.visible = false;
            ui.searchEntry.set_text('');
        }
        this.applyFilter('');
        global.stage.set_key_focus(ui.popupLayout);
    }

    toggleCaseSensitiveSearch() {
        this.#toggleSearchOption(
            () => !this.#model.caseSensitive,
            next => this.#model.setCaseSensitive(next),
            'caseSensitive');
    }

    toggleRegexSearch() {
        this.#toggleSearchOption(
            () => !this.#model.regexEnabled,
            next => this.#model.setRegexEnabled(next),
            'regex');
    }

    applyFilter(query) {
        this.#query = query;
        const source = this.#selection.getSearchSource();
        const filteredItems = this.#model.filter(source, query);
        this.#selection.showFiltered(filteredItems);
        this.#popup.renderPage();
    }

    refreshToggleButtons() {
        const ui = this.#popup.ui;
        if (!ui)
            return;
        if (ui.caseButton) {
            this.#uiBuilder.setSearchToggleState(
                ui.caseButton, this.#model.caseSensitive);
            this.#uiBuilder.setHoverTooltipText(ui.caseButton,
                _('Match Case (%s)').format(
                    this.#shortcuts.formatForHint('caseSensitive')));
        }
        if (ui.regexButton) {
            this.#uiBuilder.setSearchToggleState(
                ui.regexButton, this.#model.regexEnabled);
            this.#uiBuilder.setHoverTooltipText(ui.regexButton,
                _('Use Regular Expression (%s)').format(
                    this.#shortcuts.formatForHint('regex')));
        }
    }

    #toggleSearchOption(computeNext, applyNext, optionName) {
        const next = computeNext();
        applyNext(next);
        this.#persistSearchOption(optionName, next);
        this.refreshToggleButtons();
        this.#refocusSearchEntry();
        if (this.#isSearchMode)
            this.applyFilter(this.#popup.ui.searchEntry.get_text());
    }

    #hideSearchTooltip() {
        this.#uiBuilder.cancelPendingSearchTooltips();
        this.#uiBuilder.hideSearchTooltip(this.#popup.ui?.searchTooltip);
    }

    // toggle already flipped in memory. This persists it via the controller, which owns the settings write.
    #persistSearchOption(name, value) {
        this.#handlers.onSetSearchOption(name, !!value);
    }

    #refocusSearchEntry() {
        const ui = this.#popup.ui;
        if (this.#isSearchMode && ui?.searchEntry)
            global.stage.set_key_focus(ui.searchEntry.get_clutter_text());
    }
}
