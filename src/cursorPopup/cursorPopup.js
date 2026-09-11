import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { translate, makeTranslator } from '../common/i18n.js';
import { PrefsFields, ITEMS_PER_PAGE } from '../common/constants.js';
import { PopupUIBuilder } from './popupUI.js';
import { PopupSearch } from './popupSearch.js';
import { PopupKeyHandler } from './popupKeyHandler.js';
import {
    DEFAULT_LOCAL_SHORTCUTS,
    formatAccelerator,
    matchesShortcut,
    parseAcceleratorList,
} from './localShortcuts.js';

const _ = makeTranslator(nativeGettext);

const LOCAL_SHORTCUT_KEYS = {
    search: PrefsFields.LOCAL_SEARCH,
    deleteEntry: PrefsFields.LOCAL_DELETE_ENTRY,
    privateMode: PrefsFields.LOCAL_PRIVATE_MODE,
    pageNext: PrefsFields.LOCAL_PAGE_NEXT,
    pagePrevious: PrefsFields.LOCAL_PAGE_PREVIOUS,
    moveUp: PrefsFields.LOCAL_MOVE_UP,
    moveDown: PrefsFields.LOCAL_MOVE_DOWN,
    confirm: PrefsFields.LOCAL_CONFIRM,
    close: PrefsFields.LOCAL_CLOSE,
    caseSensitive: PrefsFields.LOCAL_CASE_SENSITIVE,
    regex: PrefsFields.LOCAL_REGEX_SEARCH,
};

export class CursorPopup {
    #facade = null;
    #uiBuilder = null;
    #search = null;
    #keyHandler = null;
    #ui = null;

    constructor(facade) {
        this.#facade = facade;
        this.#uiBuilder = new PopupUIBuilder();
        this.#search = new PopupSearch();
        this.#keyHandler = new PopupKeyHandler(this);

        this._autoPaste = true;        this._limitPopupPages = false;
        this._maxPopupPages = 3;
        this._settings = null;
        this._localShortcutStrings = {};
        this._localBindings = {};
        for (const [action, list] of Object.entries(DEFAULT_LOCAL_SHORTCUTS)) {
            this._localShortcutStrings[action] = [...list];
            this._localBindings[action] = parseAcceleratorList(list);
        }
        this._showShortcutHints = true;

        this.#ui = null;
        this._modalGrab = null;
        this._anchorX = 0;
        this._anchorY = 0;
        this._monitor = null;
        // left edge + cursor edge stay put after open, rest can move
        this._popupLock = null;
        this._linesPerItem = 3;
        this._repositionIdleId = 0;

        this._itemsToShow = [];
        this._originalItems = [];
        this._currentPage = 0;
        this._selectedIndex = -1;
        this._currentPageItems = [];
        this._isSearchMode = false;
    }

    // --- Public API (also used by PopupKeyHandler) ---

    get isSearchMode() {
        return this._isSearchMode;
    }

    updateSettings(settings) {
        this._settings = settings;
        this.#search.updateSettings(
            settings.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH),
            settings.get_boolean(PrefsFields.REGEX_SEARCH));
        for (const [action, key] of Object.entries(LOCAL_SHORTCUT_KEYS)) {
            const list = settings.get_strv(key);
            this._localShortcutStrings[action] = Array.isArray(list)
                ? [...list]
                : [...DEFAULT_LOCAL_SHORTCUTS[action]];
            this._localBindings[action] =
                parseAcceleratorList(this._localShortcutStrings[action]);
        }
        this._showShortcutHints =
            settings.get_boolean(PrefsFields.SHOW_SHORTCUT_HINTS);
        this._syncSearchToggles();
        this._syncShortcutHints();
        this._autoPaste = settings.get_boolean(PrefsFields.AUTO_PASTE);
        this._limitPopupPages = settings.get_boolean(PrefsFields.LIMIT_POPUP_PAGES);
        this._maxPopupPages = settings.get_int(PrefsFields.MAX_POPUP_PAGES);
        this.#uiBuilder.setImagePreviewSize(
            settings.get_int(PrefsFields.IMAGE_PREVIEW_SIZE));
    }

    isOpen() {
        return this.#ui !== null;
    }

    open(x, y, entries, monitor) {
        this._originalItems = entries;
        this._itemsToShow = [...entries.slice(0, this._getMaxItems(entries.length))];
        this._currentPage = 0;
        this._selectedIndex = this._itemsToShow.length > 0 ? 0 : -1;
        this._currentPageItems = [];
        this._isSearchMode = false;
        this._anchorX = x;
        this._anchorY = y;
        this._monitor = monitor;

        this._buildUI();
        this._renderPage();

        this.#ui.modalContainer.add_child(this.#ui.popupLayout);
        // last = on top for the hover tooltip
        this.#ui.modalContainer.add_child(this.#ui.searchTooltip);
        global.stage.add_child(this.#ui.modalContainer);

        const pos = this.#uiBuilder.positionPopup(
            this.#ui.modalContainer, this.#ui.popupLayout, x, y, monitor
        );
        this._popupLock = {
            x: pos.x,
            mode: pos.mode,
            belowTopY: pos.belowTopY,
            aboveBottomY: pos.aboveBottomY,
        };
        this._linesPerItem = 3;
        this.#ui.popupLayout.set_height(-1);
        this.#ui.popupLayout.set_width(-1);
        // fit now so first frame is already right, idle double-checks after layout
        this._buildAndFitPage();
        this._scheduleRepositionPopup();

        // clicks inside stop here, clicks outside hit the container below and close
        this.#ui.popupLayout.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;
        });

        // anything reaching the container was outside -> dismiss
        this.#ui.modalContainer.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });

        this.#ui.popupLayout.connect('key-press-event',
            this.#keyHandler.handleMainKeyPress.bind(this.#keyHandler));

        this.updatePrivateModeState();

        this._modalGrab = Main.pushModal(this.#ui.modalContainer);
        global.stage.set_key_focus(this.#ui.popupLayout);
    }

    close() {
        if (!this.#ui)
            return;

        this.#uiBuilder.cancelPendingSearchTooltips();
        if (this._modalGrab) {
            Main.popModal(this._modalGrab);
            this._modalGrab = null;
        }

        if (this.#ui.modalContainer) {
            global.stage.remove_child(this.#ui.modalContainer);
            this.#ui.modalContainer.destroy();
        }

        this.#ui = null;
        this._anchorX = 0;
        this._anchorY = 0;
        this._monitor = null;
        this._popupLock = null;
        this._linesPerItem = 3;
        this._cancelPendingReposition();
        this._currentPageItems = [];
        this._itemsToShow = [];
        this._originalItems = [];
    }

    // --- Search ---

    toggleSearch() {
        this._isSearchMode = !this._isSearchMode;
        if (this.#ui.searchBar)
            this.#ui.searchBar.visible = this._isSearchMode;
        else if (this.#ui.searchEntry)
            this.#ui.searchEntry.visible = this._isSearchMode;
        if (this._isSearchMode) {
            this._syncSearchToggles();
            global.stage.set_key_focus(this.#ui.searchEntry.get_clutter_text());
            // chrome height changed, re-anchor now + verify after layout
            this._repositionPopup();
            this._scheduleRepositionPopup();
        } else {
            this.exitSearch();
        }
    }

    _hideSearchTooltip() {
        this.#uiBuilder.cancelPendingSearchTooltips();
        this.#uiBuilder.hideSearchTooltip(this.#ui?.searchTooltip);
    }

    exitSearch() {
        this._isSearchMode = false;
        this._hideSearchTooltip();
        if (this.#ui.searchBar) {
            this.#ui.searchBar.visible = false;
            // bar controls visibility so toggles come back together next time
            if (this.#ui.searchEntry)
                this.#ui.searchEntry.set_text('');
        } else if (this.#ui.searchEntry) {
            this.#ui.searchEntry.visible = false;
            this.#ui.searchEntry.set_text('');
        }
        this._applySearch('');
        global.stage.set_key_focus(this.#ui.popupLayout);
    }

    toggleCaseSensitive() {
        const next = !this.#search.caseSensitive;
        this.#search.setCaseSensitive(next);
        this._persistSearchOption(PrefsFields.CASE_SENSITIVE_SEARCH, next);
        this._syncSearchToggles();
        this._refocusSearchEntry();
        if (this._isSearchMode)
            this._applySearch(this.#ui.searchEntry.get_text());
    }

    toggleRegex() {
        const next = !this.#search.regexEnabled;
        this.#search.setRegexEnabled(next);
        this._persistSearchOption(PrefsFields.REGEX_SEARCH, next);
        this._syncSearchToggles();
        this._refocusSearchEntry();
        if (this._isSearchMode)
            this._applySearch(this.#ui.searchEntry.get_text());
    }

    _persistSearchOption(key, value) {
        if (!this._settings)
            return;
        this._settings.set_boolean(key, !!value);
    }

    _syncSearchToggles() {
        if (!this.#ui)
            return;
        if (this.#ui.caseButton) {
            this.#uiBuilder.setSearchToggleState(
                this.#ui.caseButton, this.#search.caseSensitive);
            this.#ui.caseButton._hoverTooltipText = _('Match Case (%s)').format(
                this._formatLocalShortcut('caseSensitive'));
        }
        if (this.#ui.regexButton) {
            this.#uiBuilder.setSearchToggleState(
                this.#ui.regexButton, this.#search.regexEnabled);
            this.#ui.regexButton._hoverTooltipText = _('Use Regular Expression (%s)').format(
                this._formatLocalShortcut('regex'));
        }
    }

    isLocalShortcut(action, event) {
        return matchesShortcut(event, this._localBindings[action]);
    }

    _formatLocalShortcut(action) {
        const raw = this._localShortcutStrings[action]?.[0];
        if (!raw)
            return _('Disabled');
        return formatAccelerator(raw);
    }

    _syncShortcutHints() {
        if (!this.#ui)
            return;
        this._applyShortcutHint(this.#ui.searchHint, this.#ui.searchHintLabel,
            'search', ' = %s', _('Toggle search (%s)'));
        this._applyShortcutHint(this.#ui.privateModeHint, this.#ui.privateModeHintLabel,
            'privateMode', ' = %s', _('Toggle private mode (%s)'));
        this._applyShortcutHint(this.#ui.deleteHint, this.#ui.deleteHintLabel,
            'deleteEntry', ' = %s', _('Delete selected entry (%s)'));
    }

    _applyShortcutHint(hintActor, labelActor, action, labelFormat, tooltipFormat) {
        if (!hintActor || !labelActor)
            return;
        const bound = (this._localBindings[action]?.length ?? 0) > 0;
        hintActor.visible = this._showShortcutHints !== false && bound;
        if (!bound)
            return;
        const display = this._formatLocalShortcut(action);
        labelActor.set_text(labelFormat.format(display));
        hintActor._hoverTooltipText = tooltipFormat.format(display);
    }

    _refocusSearchEntry() {
        if (this._isSearchMode && this.#ui?.searchEntry)
            global.stage.set_key_focus(this.#ui.searchEntry.get_clutter_text());
    }

    // --- Selection ---

    confirmSelection() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;
        const start = this._currentPage * ITEMS_PER_PAGE;
        this._selectItem(this._itemsToShow[start + this._selectedIndex]);
    }

    selectByNumberKey(keySymbol) {
        let idx;
        if (keySymbol === Clutter.KEY_0) {
            idx = 9;
        } else {
            idx = keySymbol - Clutter.KEY_1;
        }

        const start = this._currentPage * ITEMS_PER_PAGE;
        if (start + idx < this._itemsToShow.length) {
            this._selectItem(this._itemsToShow[start + idx]);
        }
    }

    // --- Navigation ---

    navigateUp() {
        const len = this._currentPageItems.length;
        if (len === 0) return;
        this._updateSelection(this._selectedIndex <= 0 ? len - 1 : this._selectedIndex - 1);
    }

    navigateDown() {
        const len = this._currentPageItems.length;
        if (len === 0) return;
        this._updateSelection(this._selectedIndex >= len - 1 ? 0 : this._selectedIndex + 1);
    }

    navigatePageForward() {
        const totalPages = this._getTotalPages();
        if (totalPages <= 1) return;
        this._currentPage = (this._currentPage + 1) % totalPages;
        this._selectedIndex = 0;
        this._renderPage();
    }

    navigatePageBack() {
        const totalPages = this._getTotalPages();
        if (totalPages <= 1) return;
        this._currentPage = (this._currentPage - 1 + totalPages) % totalPages;
        this._selectedIndex = 0;
        this._renderPage();
    }

    // --- Deletion ---

    deleteSelectedItem() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;

        const start = this._currentPage * ITEMS_PER_PAGE;
        const target = this._itemsToShow[start + this._selectedIndex];
        this.#facade.deleteEntry(target);

        // keep the search filter after a delete
        const updatedItems = this.#facade.getEntries();
        this._originalItems = updatedItems;

        if (this._isSearchMode && this.#ui.searchEntry.get_text() !== '') {
            this._applySearch(this.#ui.searchEntry.get_text());
        } else {
            this._itemsToShow = updatedItems.slice(0, this._getMaxItems(updatedItems.length));
        }

        if (this._itemsToShow.length === 0) {
            this._currentPage = 0;
            this._selectedIndex = -1;
            this._renderPage();
            return;
        }

        const newPageCount = this._getTotalPages();
        if (this._currentPage >= newPageCount) {
            this._currentPage = newPageCount - 1;
        }

        const newPageStart = this._currentPage * ITEMS_PER_PAGE;
        const newPageItemCount = Math.min(ITEMS_PER_PAGE, this._itemsToShow.length - newPageStart);
        if (this._selectedIndex >= newPageItemCount) {
            this._selectedIndex = Math.max(0, newPageItemCount - 1);
        }

        this._renderPage();
    }

    // --- Private mode ---

    togglePrivateMode() {
        this.#facade.togglePrivateMode();
    }

    // --- Private: UI construction ---

    _buildUI() {
        const modalContainer = this.#uiBuilder.createModalContainer();
        const popupLayout = this.#uiBuilder.createPopupLayout();
        const listContainer = this.#uiBuilder.createListContainer();
        const listScrollView = this.#uiBuilder.createListScrollView(listContainer);

        const { searchBar, entry, caseButton, regexButton, tooltip } = this.#uiBuilder.createSearchBar(
            (query) => this._applySearch(query),
            (event) => this.#keyHandler.handleSearchKeyPress(event),
            () => this.toggleCaseSensitive(),
            () => this.toggleRegex(),
            modalContainer,
        );

        const {
            footerBox, searchHint, searchHintLabel, privateModeHint,
            privateModeHintLabel, deleteHint, deleteHintLabel, pageIndicator,
        } = this.#uiBuilder.createFooter(modalContainer, tooltip);

        this.#ui = {
            modalContainer,
            popupLayout,
            listContainer,
            listScrollView,
            searchBar,
            searchEntry: entry,
            caseButton,
            regexButton,
            searchTooltip: tooltip,
            searchHint,
            searchHintLabel,
            privateModeHint,
            privateModeHintLabel,
            deleteHint,
            deleteHintLabel,
            pageIndicator,
        };
        this._syncSearchToggles();
        this._syncShortcutHints();

        this.#ui.popupLayout.add_child(this.#ui.searchBar);
        this.#ui.popupLayout.add_child(this.#ui.listScrollView);
        this.#ui.popupLayout.add_child(footerBox);
    }

    // --- Private: rendering ---

    _renderPage() {
        this._linesPerItem = 3;
        this._buildAndFitPage();
        this._scheduleRepositionPopup();
    }

    _buildPageItems(lines) {
        this.#ui.listContainer.destroy_all_children();
        this._currentPageItems = [];

        const start = this._currentPage * ITEMS_PER_PAGE;
        const pageItems = this._itemsToShow.slice(start, start + ITEMS_PER_PAGE);

        if (pageItems.length === 0) {
            const emptyText = this._originalItems.length === 0
                ? _('Clipboard history is empty')
                : _('No matching clipboard items');
            this.#ui.listContainer.add_child(
                this.#uiBuilder.createEmptyLabel(emptyText));
        }

        pageItems.forEach((entry, index) => {
            const itemBox = this.#uiBuilder.createItemWidget(
                entry, index, (item) => this._selectItem(item), lines
            );

            if (index === this._selectedIndex) {
                itemBox.add_style_class_name('selected');
            }

            this.#ui.listContainer.add_child(itemBox);
            this._currentPageItems.push(itemBox);
        });

        const pageCount = this._getTotalPages();
        this.#ui.pageIndicator.set_text(`${this._currentPage + 1} / ${pageCount}`);
        this.#ui.pageIndicator.visible = this._itemsToShow.length > 0;

        this._linesPerItem = lines;
        this._resetListScrollTop();
    }

    _isOnStage() {
        return !!(this.#ui?.modalContainer && this.#ui.modalContainer.get_parent());
    }

    _getAvailH() {
        return this.#uiBuilder.availHeightForLock(this._popupLock, this._monitor);
    }

    _fitRowsToLock(startLines) {
        let h = 0;
        for (let lines = startLines; lines >= 1; lines--) {
            this._buildPageItems(lines);
            // uncap first so we measure the real size
            this._disableListScroll();
            this.#ui.popupLayout.set_height(-1);
            this.#ui.popupLayout.set_width(-1);
            ({ natH: h } = this.#uiBuilder.measurePopup(
                this.#ui.popupLayout, this._monitor, this._popupLock.x));
            if (h <= this._getAvailH())
                break;
        }
        return h;
    }

    _setListScrollPolicy(mode) {
        if (!this.#ui.listScrollView)
            return;
        // set_policy is 47+, older shells use the properties
        if (typeof this.#ui.listScrollView.set_policy === 'function') {
            this.#ui.listScrollView.set_policy(
                St.PolicyType.NEVER, mode);
        } else {
            this.#ui.listScrollView.vscrollbar_policy = mode;
            this.#ui.listScrollView.hscrollbar_policy = St.PolicyType.NEVER;
        }
    }

    _disableListScroll() {
        if (!this.#ui.listScrollView)
            return;
        this._setListScrollPolicy(St.PolicyType.NEVER);
        this.#ui.listScrollView.set_height(-1);
    }

    _enableListScroll(listHeight) {
        if (!this.#ui.listScrollView)
            return;
        this._setListScrollPolicy(St.PolicyType.AUTOMATIC);
        this.#ui.listScrollView.set_height(Math.max(0, listHeight));
    }

    _resetListScrollTop() {
        if (!this.#ui.listScrollView)
            return;
        this.#ui.listScrollView.get_vadjustment().set_value(0);
    }

    _ensureSelectedVisible() {
        // best-effort, highlight alone is fine if measuring fails
        try {
            const scrollView = this.#ui.listScrollView;
            const item = this._currentPageItems[this._selectedIndex];
            if (!scrollView || !item)
                return;
            const adjustment = scrollView.get_vadjustment();
            if (!adjustment)
                return;
            if (adjustment.get_page_size() >= adjustment.get_upper())
                return;
            let top = null;
            let bottom = null;
            const [, y] = item.get_position();
            const h = item.get_height();
            if (Number.isFinite(y) && Number.isFinite(h)) {
                top = y;
                bottom = y + h;
            }
            if (top === null) {
                const box = item.get_allocation_box();
                if (box && Number.isFinite(box.y1) && Number.isFinite(box.y2)) {
                    top = box.y1;
                    bottom = box.y2;
                }
            }
            if (top === null || bottom === null)
                return;
            adjustment.clamp_page(top, bottom);
        } catch (_e) { /* best-effort: selection highlight is enough */ }
    }

    _anchorToLock(height) {
        const availH = this._getAvailH();
        if (height <= availH) {
            this._disableListScroll();
            this.#ui.popupLayout.set_height(-1);
            this.#uiBuilder.anchorPopup(
                this.#ui.modalContainer, this.#ui.popupLayout, this._popupLock,
                this._monitor, height);
            return;
        }
        // too tall even squeezed: lock the cursor edge, scroll the rows
        try {
            const { availableW } = this.#uiBuilder.measurePopup(
                this.#ui.popupLayout, this._monitor, this._popupLock.x);
            const [, listNatH] = this.#ui.listContainer.get_preferred_height(availableW);
            const chromeH = Math.max(0, height - listNatH);
            const maxListH = Math.max(0, availH - chromeH);
            this._enableListScroll(maxListH);
            this._resetListScrollTop();
        } catch (_e) {
            // measuring broke, just hard-cap so we stay on-screen
            this._disableListScroll();
            this.#ui.popupLayout.set_height(Math.max(0, availH));
            this.#uiBuilder.anchorPopup(
                this.#ui.modalContainer, this.#ui.popupLayout, this._popupLock,
                this._monitor, Math.max(0, availH));
            return;
        }
        this.#ui.popupLayout.set_height(-1);
        this.#uiBuilder.anchorPopup(
            this.#ui.modalContainer, this.#ui.popupLayout, this._popupLock,
            this._monitor, Math.max(0, availH));
    }

    // try 3/2/1-line rows, anchor right away so no flicker (off-stage just builds full)
    _buildAndFitPage() {
        if (!this._isOnStage() || !this._popupLock || !this._monitor) {
            this._buildPageItems(3);
            return;
        }

        // uncap first so we measure the real size
        this._disableListScroll();
        this.#ui.popupLayout.set_height(-1);
        this.#ui.popupLayout.set_width(-1);

        const natH = this._fitRowsToLock(3);
        this._anchorToLock(natH);
    }

    _updateSelection(newIndex) {
        this._currentPageItems.forEach((item, i) => {
            if (i === newIndex) {
                item.add_style_class_name('selected');
            } else {
                item.remove_style_class_name('selected');
            }
        });
        this._selectedIndex = newIndex;
        this._ensureSelectedVisible();
    }

    // --- Private: selection ---

    _selectItem(entry) {
        this.#facade.selectAndPaste(entry);
    }

    // --- Private: search ---

    _applySearch(query) {
        const filteredItems = this.#search.filter(this._originalItems, query);
        this._itemsToShow = filteredItems.slice(0, this._getMaxItems(filteredItems.length));
        this._currentPage = 0;
        this._selectedIndex = this._itemsToShow.length > 0 ? 0 : -1;
        this._renderPage();
    }

    // --- Private: helpers ---

    updatePrivateModeState() {
        if (!this.#ui?.privateModeHint)
            return;
        if (this.#facade.isPrivateMode()) {
            this.#ui.privateModeHint.add_style_class_name('active');
        } else {
            this.#ui.privateModeHint.remove_style_class_name('active');
        }
    }

    _getMaxItems(totalAvailable) {
        if (!this._limitPopupPages) return totalAvailable;
        return this._maxPopupPages * ITEMS_PER_PAGE;
    }

    _getTotalPages() {
        return Math.ceil(this._itemsToShow.length / ITEMS_PER_PAGE) || 1;
    }

    _repositionPopup() {
        if (!this.#ui?.modalContainer || !this.#ui?.popupLayout || !this._monitor) return;

        if (!this._popupLock) {
            this.#uiBuilder.positionPopup(
                this.#ui.modalContainer,
                this.#ui.popupLayout,
                this._anchorX,
                this._anchorY,
                this._monitor,
            );
            return;
        }

        const lock = this._popupLock;

        // uncap first or a capped list fakes a small size
        this._disableListScroll();
        this.#ui.popupLayout.set_height(-1);
        this.#ui.popupLayout.set_width(-1);
        const { natH } = this.#uiBuilder.measurePopup(
            this.#ui.popupLayout, this._monitor, lock.x);
        const availH = this._getAvailH();

        if (natH > availH && this._linesPerItem > 1) {
            const h = this._fitRowsToLock(this._linesPerItem - 1);
            this._anchorToLock(h);
            this._scheduleRepositionPopup();
            return;
        }

        this._anchorToLock(natH);
    }

    _scheduleRepositionPopup() {
        this._cancelPendingReposition();
        this._repositionIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._repositionIdleId = 0;
            this._repositionPopup();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPendingReposition() {
        if (!this._repositionIdleId) return;

        GLib.source_remove(this._repositionIdleId);
        this._repositionIdleId = 0;
    }
}
