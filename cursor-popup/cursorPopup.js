/**
 * CursorPopup - Handles the cursor-positioned popup for quick clipboard selection
 *
 * Features:
 * - Paged display (10 items per page)
 * - Keyboard navigation (Up/Down, Tab/Shift+Tab for pages)
 * - Search functionality (press 's')
 * - Delete items (press 'd')
 * - Click outside to close
 * - Auto-paste support
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { translate } from '../src/i18n.js';
import { PrefsFields } from '../constants.js';
import { PopupUIBuilder } from './popupUI.js';
import { PopupSearch } from './popupSearch.js';
import { PopupKeyHandler } from './popupKeyHandler.js';
import {
    DEFAULT_LOCAL_SHORTCUTS,
    formatAccelerator,
    matchesShortcut,
    parseAcceleratorList,
} from './localShortcuts.js';

const _ = msgid => translate(msgid, nativeGettext);

const ITEMS_PER_PAGE = 10;

/** Popup-local action -> GSettings strv key holding its accelerators. */
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
    constructor(parent) {
        this._parent = parent;
        this._uiBuilder = new PopupUIBuilder();
        this._search = new PopupSearch();
        this._keyHandler = new PopupKeyHandler(this);

        // Settings
        this._autoPaste = true;
        this._limitPopupPages = false;
        this._maxPopupPages = 3;
        this._settings = null;
        // Popup-local shortcuts: raw accelerator strings plus parsed
        // bindings per action (refreshed in updateSettings).
        this._localShortcutStrings = {};
        this._localBindings = {};
        for (const [action, list] of Object.entries(DEFAULT_LOCAL_SHORTCUTS)) {
            this._localShortcutStrings[action] = [...list];
            this._localBindings[action] = parseAcceleratorList(list);
        }
        this._showShortcutHints = true;

        // UI references
        this._modalContainer = null;
        this._popupLayout = null;
        this._modalGrab = null;
        this._listContainer = null;
        this._listScrollView = null;
        this._searchBar = null;
        this._searchEntry = null;
        this._caseButton = null;
        this._regexButton = null;
        this._searchTooltip = null;
        this._pageIndicator = null;
        this._searchHint = null;
        this._searchHintLabel = null;
        this._privateModeHint = null;
        this._privateModeHintLabel = null;
        this._deleteHint = null;
        this._deleteHintLabel = null;
        this._anchorX = 0;
        this._anchorY = 0;
        this._monitor = null;
        // Locked placement: { x, mode: 'below'|'above', belowTopY, aboveBottomY }.
        // Left edge and cursor-anchored edge never move after open(); only the
        // opposite edge (bottom in below-mode, top in above-mode) and the
        // right side may change. Width/height may shrink/grow freely.
        this._popupLock = null;
        this._linesPerItem = 3;
        this._repositionIdleId = 0;

        // Data state
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

    /**
     * Update popup settings from GSettings. Call this whenever settings change.
     * Also persists the Gio.Settings handle so search toggle clicks can
     * write their state back (preserved on next open).
     */
    updateSettings(settings) {
        this._settings = settings;
        this._search.updateSettings(
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
        this._uiBuilder.setImagePreviewSize(
            settings.get_int(PrefsFields.IMAGE_PREVIEW_SIZE));
    }

    isOpen() {
        return this._popupLayout !== null;
    }

    open(x, y, items, monitor) {
        this._originalItems = items;
        this._itemsToShow = [...items.slice(0, this._getMaxItems(items.length))];
        this._currentPage = 0;
        this._selectedIndex = this._itemsToShow.length > 0 ? 0 : -1;
        this._currentPageItems = [];
        this._isSearchMode = false;
        this._anchorX = x;
        this._anchorY = y;
        this._monitor = monitor;

        this._buildUI();
        this._renderPage();

        this._modalContainer.add_child(this._popupLayout);
        // Added last so the hover tooltip paints above the popup.
        this._modalContainer.add_child(this._searchTooltip);
        global.stage.add_child(this._modalContainer);

        const pos = this._uiBuilder.positionPopup(
            this._modalContainer, this._popupLayout, x, y, monitor
        );
        // Lock left edge + cursor-anchored edge. Page/search changes keep
        // this anchor: below-mode grows/shrinks the bottom, above-mode
        // grows/shrinks the top. Right side may grow within the monitor.
        this._popupLock = {
            x: pos.x,
            mode: pos.mode,
            belowTopY: pos.belowTopY,
            aboveBottomY: pos.aboveBottomY,
        };
        this._linesPerItem = 3;
        this._popupLayout.set_height(-1);
        this._popupLayout.set_width(-1);
        // Fit + anchor synchronously while still in open()'s callstack so the
        // first painted frame already respects the lock (no downwards flash
        // for above-mode). Idle only re-verifies post-layout size.
        this._buildAndFitPage();
        this._scheduleRepositionPopup();

        // Stop click events at the popup boundary so they don't
        // bubble up to the modal container's dismiss handler.
        this._popupLayout.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;
        });

        // Any click that reaches the modal container was outside the
        // popup layout (clicks inside are stopped above), so dismiss.
        this._modalContainer.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });

        this._popupLayout.connect('key-press-event',
            this._keyHandler.handleMainKeyPress.bind(this._keyHandler));

        this._updatePrivateModeState();

        this._modalGrab = Main.pushModal(this._modalContainer);
        global.stage.set_key_focus(this._popupLayout);
    }

    close() {
        if (!this._popupLayout) return;

        this._uiBuilder.cancelPendingSearchTooltips();
        if (this._modalGrab) {
            Main.popModal(this._modalGrab);
            this._modalGrab = null;
        }

        if (this._modalContainer) {
            global.stage.remove_child(this._modalContainer);
            this._modalContainer.destroy();
            this._modalContainer = null;
        }

        this._popupLayout = null;
        this._listContainer = null;
        this._listScrollView = null;
        this._searchBar = null;
        this._searchEntry = null;
        this._caseButton = null;
        this._regexButton = null;
        this._searchTooltip = null;
        this._pageIndicator = null;
        this._searchHint = null;
        this._searchHintLabel = null;
        this._privateModeHint = null;
        this._privateModeHintLabel = null;
        this._deleteHint = null;
        this._deleteHintLabel = null;
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
        if (this._searchBar)
            this._searchBar.visible = this._isSearchMode;
        else if (this._searchEntry)
            this._searchEntry.visible = this._isSearchMode;
        if (this._isSearchMode) {
            this._syncSearchToggles();
            global.stage.set_key_focus(this._searchEntry.get_clutter_text());
            // Search entry changes chrome height: anchor synchronously before
            // paint (cursor edge stays), then verify post-layout via idle.
            this._repositionPopup();
            this._scheduleRepositionPopup();
        } else {
            this.exitSearch();
        }
    }

    _hideSearchTooltip() {
        this._uiBuilder.cancelPendingSearchTooltips();
        this._uiBuilder.hideSearchTooltip(this._searchTooltip);
    }

    exitSearch() {
        this._isSearchMode = false;
        this._hideSearchTooltip();
        if (this._searchBar) {
            this._searchBar.visible = false;
            // Entry stays visible inside the bar; the bar itself controls
            // visibility so toggles reappear together on next open.
            if (this._searchEntry)
                this._searchEntry.set_text('');
        } else if (this._searchEntry) {
            this._searchEntry.visible = false;
            this._searchEntry.set_text('');
        }
        this._applySearch('');
        global.stage.set_key_focus(this._popupLayout);
    }

    toggleCaseSensitive() {
        const next = !this._search.caseSensitive;
        this._search.setCaseSensitive(next);
        this._persistSearchOption(PrefsFields.CASE_SENSITIVE_SEARCH, next);
        this._syncSearchToggles();
        this._refocusSearchEntry();
        if (this._isSearchMode)
            this._applySearch(this._searchEntry.get_text());
    }

    toggleRegex() {
        const next = !this._search.regexEnabled;
        this._search.setRegexEnabled(next);
        this._persistSearchOption(PrefsFields.REGEX_SEARCH, next);
        this._syncSearchToggles();
        this._refocusSearchEntry();
        if (this._isSearchMode)
            this._applySearch(this._searchEntry.get_text());
    }

    _persistSearchOption(key, value) {
        if (!this._settings)
            return;
        this._settings.set_boolean(key, !!value);
    }

    _syncSearchToggles() {
        if (this._caseButton) {
            this._uiBuilder.setSearchToggleState(
                this._caseButton, this._search.caseSensitive);
            this._caseButton._hoverTooltipText = _('Match Case (%s)').format(
                this._formatLocalShortcut('caseSensitive'));
        }
        if (this._regexButton) {
            this._uiBuilder.setSearchToggleState(
                this._regexButton, this._search.regexEnabled);
            this._regexButton._hoverTooltipText = _('Use Regular Expression (%s)').format(
                this._formatLocalShortcut('regex'));
        }
    }

    /**
     * Whether a key event hits the user's binding for a popup-local
     * action (see LocalActions in localShortcuts.js).
     */
    isLocalShortcut(action, event) {
        return matchesShortcut(event, this._localBindings[action]);
    }

    /**
     * Display string for an action's first configured accelerator
     * (e.g. 's', 'Alt+C'), or 'Disabled' when unbound.
     */
    _formatLocalShortcut(action) {
        const raw = this._localShortcutStrings[action]?.[0];
        if (!raw)
            return _('Disabled');
        return formatAccelerator(raw);
    }

    /**
     * Refresh the footer reminder icons: labels follow the configured
     * shortcuts, and each hint hides when its action is unbound or the
     * "Show shortcut reminder icons" setting is off.
     */
    _syncShortcutHints() {
        // _applyShortcutHint null-guards each actor pair, so calling
        // before the UI is built is a safe no-op.
        this._applyShortcutHint(this._searchHint, this._searchHintLabel,
            'search', ' = %s', _('Toggle search (%s)'));
        this._applyShortcutHint(this._privateModeHint, this._privateModeHintLabel,
            'privateMode', ' = %s', _('Toggle private mode (%s)'));
        this._applyShortcutHint(this._deleteHint, this._deleteHintLabel,
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
        if (this._isSearchMode && this._searchEntry)
            global.stage.set_key_focus(this._searchEntry.get_clutter_text());
    }

    // --- Selection ---

    confirmSelection() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;
        const start = this._currentPage * ITEMS_PER_PAGE;
        this._selectItem(this._itemsToShow[start + this._selectedIndex]);
    }

    /**
     * Select an item by its number key (0-9).
     * Keys 1-9 map to indices 0-8, key 0 maps to index 9.
     */
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
        this._parent._removeEntry(target, 'delete');

        // Refresh items from the parent, preserving active search filter
        const updatedItems = this._parent._getAllIMenuItems().filter(item => item.actor.visible);
        this._originalItems = updatedItems;

        if (this._isSearchMode && this._searchEntry.get_text() !== '') {
            this._applySearch(this._searchEntry.get_text());
        } else {
            this._itemsToShow = updatedItems.slice(0, this._getMaxItems(updatedItems.length));
        }

        if (this._itemsToShow.length === 0) {
            this._currentPage = 0;
            this._selectedIndex = -1;
            this._renderPage();
            return;
        }

        // Clamp current page
        const newPageCount = this._getTotalPages();
        if (this._currentPage >= newPageCount) {
            this._currentPage = newPageCount - 1;
        }

        // Clamp selection to the new page's actual item count
        const newPageStart = this._currentPage * ITEMS_PER_PAGE;
        const newPageItemCount = Math.min(ITEMS_PER_PAGE, this._itemsToShow.length - newPageStart);
        if (this._selectedIndex >= newPageItemCount) {
            this._selectedIndex = Math.max(0, newPageItemCount - 1);
        }

        this._renderPage();
    }

    // --- Private mode ---

    togglePrivateMode() {
        this._parent.togglePrivateMode();
        this._updatePrivateModeState();
    }

    // --- Private: UI construction ---

    _buildUI() {
        this._modalContainer = this._uiBuilder.createModalContainer();
        this._popupLayout = this._uiBuilder.createPopupLayout();
        this._listContainer = this._uiBuilder.createListContainer();
        this._listScrollView = this._uiBuilder.createListScrollView(this._listContainer);

        const { searchBar, entry, caseButton, regexButton, tooltip } = this._uiBuilder.createSearchBar(
            (query) => this._applySearch(query),
            (event) => this._keyHandler.handleSearchKeyPress(event),
            () => this.toggleCaseSensitive(),
            () => this.toggleRegex(),
            this._modalContainer,
        );
        this._searchBar = searchBar;
        this._searchEntry = entry;
        this._caseButton = caseButton;
        this._regexButton = regexButton;
        this._searchTooltip = tooltip;
        // NOTE: the tooltip is added to the modal container in open(),
        // AFTER the popup layout, so it stacks (and paints) on top.
        // It floats without disturbing the popup layout.
        this._syncSearchToggles();

        const {
            footerBox, searchHint, searchHintLabel, privateModeHint,
            privateModeHintLabel, deleteHint, deleteHintLabel, pageIndicator,
        } = this._uiBuilder.createFooter(this._modalContainer, tooltip);
        this._searchHint = searchHint;
        this._searchHintLabel = searchHintLabel;
        this._privateModeHint = privateModeHint;
        this._privateModeHintLabel = privateModeHintLabel;
        this._deleteHint = deleteHint;
        this._deleteHintLabel = deleteHintLabel;
        this._pageIndicator = pageIndicator;
        this._syncShortcutHints();

        this._popupLayout.add_child(this._searchBar);
        this._popupLayout.add_child(this._listScrollView);
        this._popupLayout.add_child(footerBox);
    }

    // --- Private: rendering ---

    _renderPage() {
        // Fresh page (Tab/search/delete): be optimistic, try full 3-line rows
        // first, then shrink rows until the locked anchor fits. The anchor
        // (top in below-mode, bottom in above-mode) never moves.
        this._linesPerItem = 3;
        this._buildAndFitPage();
        this._scheduleRepositionPopup();
    }

    _buildPageItems(lines) {
        this._listContainer.destroy_all_children();
        this._currentPageItems = [];

        const start = this._currentPage * ITEMS_PER_PAGE;
        const pageItems = this._itemsToShow.slice(start, start + ITEMS_PER_PAGE);

        if (pageItems.length === 0) {
            const emptyText = this._originalItems.length === 0
                ? _('Clipboard history is empty')
                : _('No matching clipboard items');
            this._listContainer.add_child(
                this._uiBuilder.createEmptyLabel(emptyText));
        }

        pageItems.forEach((mItem, index) => {
            const itemBox = this._uiBuilder.createItemWidget(
                mItem, index, (item) => this._selectItem(item), lines
            );

            if (index === this._selectedIndex) {
                itemBox.add_style_class_name('selected');
            }

            this._listContainer.add_child(itemBox);
            this._currentPageItems.push(itemBox);
        });

        const pageCount = this._getTotalPages();
        this._pageIndicator.set_text(`${this._currentPage + 1} / ${pageCount}`);
        this._pageIndicator.visible = this._itemsToShow.length > 0;

        this._linesPerItem = lines;
        this._resetListScrollTop();
    }

    _isOnStage() {
        return !!(this._modalContainer && this._modalContainer.get_parent());
    }

    _getAvailH() {
        if (!this._popupLock || !this._monitor) return Infinity;
        if (this._popupLock.mode === 'above') {
            return Math.max(0, this._popupLock.aboveBottomY - 10);
        }
        return Math.max(0,
            this._monitor.height - this._popupLock.belowTopY - 10);
    }

    /**
     * Try row densities from `startLines` down to 1 and keep the fullest
     * variant that fits the locked available height. Returns the final
     * natural height (possibly still overflowing when even 1-line rows
     * don't fit — callers enable list scrolling in that case).
     */
    _fitRowsToLock(startLines) {
        let h = 0;
        for (let lines = startLines; lines >= 1; lines--) {
            this._buildPageItems(lines);
            // Drop any scroll cap so we measure the true natural size;
            // scrolling is only enabled once nothing fits naturally.
            this._disableListScroll();
            this._popupLayout.set_height(-1);
            this._popupLayout.set_width(-1);
            ({ natH: h } = this._uiBuilder.measurePopup(
                this._popupLayout, this._monitor, this._popupLock.x));
            if (h <= this._getAvailH())
                break;
        }
        return h;
    }

    _setListScrollPolicy(mode) {
        if (!this._listScrollView)
            return;
        // Feature detection for the supported range (GNOME 46-51):
        // St.ScrollView gained set_policy() in GNOME 47; older shells
        // expose the vscrollbar_policy/hscrollbar_policy properties.
        if (typeof this._listScrollView.set_policy === 'function') {
            this._listScrollView.set_policy(
                St.PolicyType.NEVER, mode);
        } else {
            this._listScrollView.vscrollbar_policy = mode;
            this._listScrollView.hscrollbar_policy = St.PolicyType.NEVER;
        }
    }

    /** Natural list size: no cap, no scrollbar. */
    _disableListScroll() {
        if (!this._listScrollView)
            return;
        this._setListScrollPolicy(St.PolicyType.NEVER);
        this._listScrollView.set_height(-1);
    }

    /**
     * Cap the list to `listHeight` and enable the scrollbar. The outer
     * popup keeps its natural height (now exactly the available height)
     * so search + footer stay visible while only the rows scroll.
     */
    _enableListScroll(listHeight) {
        if (!this._listScrollView)
            return;
        this._setListScrollPolicy(St.PolicyType.AUTOMATIC);
        this._listScrollView.set_height(Math.max(0, listHeight));
    }

    _resetListScrollTop() {
        if (!this._listScrollView)
            return;
        this._listScrollView.get_vadjustment().set_value(0);
    }

    _ensureSelectedVisible() {
        // Best-effort scroll: measuring live actors can fail mid-teardown,
        // in which case the selection highlight alone is enough.
        try {
            const scrollView = this._listScrollView;
            const item = this._currentPageItems[this._selectedIndex];
            if (!scrollView || !item)
                return;
            const adjustment = scrollView.get_vadjustment();
            if (!adjustment)
                return;
            // No scrolling active: the whole list is visible already.
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
            // Everything fits: natural size, no scrolling.
            this._disableListScroll();
            this._popupLayout.set_height(-1);
            this._uiBuilder.anchorPopup(
                this._modalContainer, this._popupLayout, this._popupLock,
                this._monitor, height);
            return;
        }
        // Nothing fits naturally (not even 1-line rows): keep the
        // cursor-anchored edge locked and scroll the rows instead of
        // painting past the monitor edge. Chrome (search + footer)
        // stays visible; only the list height is capped.
        try {
            const { availableW } = this._uiBuilder.measurePopup(
                this._popupLayout, this._monitor, this._popupLock.x);
            const [, listNatH] = this._listContainer.get_preferred_height(availableW);
            const chromeH = Math.max(0, height - listNatH);
            const maxListH = Math.max(0, availH - chromeH);
            this._enableListScroll(maxListH);
            this._resetListScrollTop();
        } catch (_e) {
            // If measuring the split fails, fall back to a hard outer cap
            // so the popup never paints outside the monitor.
            this._disableListScroll();
            this._popupLayout.set_height(Math.max(0, availH));
            this._uiBuilder.anchorPopup(
                this._modalContainer, this._popupLayout, this._popupLock,
                this._monitor, Math.max(0, availH));
            return;
        }
        this._popupLayout.set_height(-1);
        this._uiBuilder.anchorPopup(
            this._modalContainer, this._popupLayout, this._popupLock,
            this._monitor, Math.max(0, availH));
    }

    /**
     * Synchronously try 3/2/1-line rows and keep the fullest variant that
     * fits the locked available height. Width/height may change, but the
     * cursor-anchored edge stays. Off-stage (initial open) measurement is
     * unreliable, so just build full rows and let the idle pass fit.
     */
    _buildAndFitPage() {
        if (!this._isOnStage() || !this._popupLock || !this._monitor) {
            this._buildPageItems(3);
            return;
        }

        // Clear any previous hard cap so we measure true natural size.
        this._disableListScroll();
        this._popupLayout.set_height(-1);
        this._popupLayout.set_width(-1);

        const natH = this._fitRowsToLock(3);
        // Anchor synchronously BEFORE paint: above-mode moves Y up-front
        // so the bottom edge never detaches for a frame. Idle only verifies.
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

    _selectItem(mItem) {
        this._parent._selectMenuItem(mItem, true);
        if (this._parent.moveItemFirst) {
            this._parent._moveItemFirst(mItem);
        }
        if (this._autoPaste) {
            this._parent.autoPasteAndClose(mItem);
        } else {
            this.close();
        }
    }

    // --- Private: search ---

    _applySearch(query) {
        const filteredItems = this._search.filter(this._originalItems, query);
        this._itemsToShow = filteredItems.slice(0, this._getMaxItems(filteredItems.length));
        this._currentPage = 0;
        this._selectedIndex = this._itemsToShow.length > 0 ? 0 : -1;
        this._renderPage();
    }

    // --- Private: helpers ---

    _updatePrivateModeState() {
        if (this._parent.isPrivateMode) {
            this._privateModeHint.add_style_class_name('active');
        } else {
            this._privateModeHint.remove_style_class_name('active');
        }
    }

    /**
     * Compute the maximum number of items to show based on page settings.
     */
    _getMaxItems(totalAvailable) {
        if (!this._limitPopupPages) return totalAvailable;
        return this._maxPopupPages * ITEMS_PER_PAGE;
    }

    _getTotalPages() {
        return Math.ceil(this._itemsToShow.length / ITEMS_PER_PAGE) || 1;
    }

    _repositionPopup() {
        if (!this._modalContainer || !this._popupLayout || !this._monitor) return;

        // No lock yet (should not happen after open): fall back to initial
        // below-first placement.
        if (!this._popupLock) {
            this._uiBuilder.positionPopup(
                this._modalContainer,
                this._popupLayout,
                this._anchorX,
                this._anchorY,
                this._monitor,
            );
            return;
        }

        const lock = this._popupLock;

        // Measure true natural size (drop any previous scroll/height cap
        // first, otherwise a capped list would fake a fitting size).
        this._disableListScroll();
        this._popupLayout.set_height(-1);
        this._popupLayout.set_width(-1);
        const { natH } = this._uiBuilder.measurePopup(
            this._popupLayout, this._monitor, lock.x);
        const availH = this._getAvailH();

        if (natH > availH && this._linesPerItem > 1) {
            // Step rows down synchronously (no paint between rebuilds) and
            // anchor the final size NOW so the next painted frame already
            // keeps the cursor edge glued. Idle only verifies post-layout.
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
