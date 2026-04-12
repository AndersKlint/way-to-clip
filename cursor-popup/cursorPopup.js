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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PrefsFields } from '../constants.js';
import { PopupUIBuilder } from './popupUI.js';
import { PopupSearch } from './popupSearch.js';
import { PopupKeyHandler } from './popupKeyHandler.js';

const ITEMS_PER_PAGE = 10;

export class CursorPopup {
    constructor(parent) {
        this._parent = parent;
        this._uiBuilder = new PopupUIBuilder();
        this._search = new PopupSearch();
        this._keyHandler = new PopupKeyHandler(this);

        // Settings
        this._autoPaste = true;
        this._maxPopupPages = 3;

        // UI references
        this._modalContainer = null;
        this._popupLayout = null;
        this._modalGrab = null;
        this._listContainer = null;
        this._searchEntry = null;
        this._pageIndicator = null;
        this._privateModeHint = null;

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
     */
    updateSettings(settings) {
        this._search.updateSettings(
            settings.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH),
            settings.get_boolean(PrefsFields.REGEX_SEARCH),
        );
        this._autoPaste = settings.get_boolean(PrefsFields.AUTO_PASTE);
        this._maxPopupPages = settings.get_int(PrefsFields.MAX_POPUP_PAGES);
    }

    isOpen() {
        return this._popupLayout !== null;
    }

    open(x, y, items, monitor) {
        if (items.length === 0) {
            this._parent._showNotification(_("Clipboard is empty"));
            return;
        }

        this._originalItems = items;
        this._itemsToShow = [...items.slice(0, this._getMaxItems(items.length))];
        this._currentPage = 0;
        this._selectedIndex = 0;
        this._currentPageItems = [];
        this._isSearchMode = false;

        this._buildUI();
        this._renderPage();

        this._modalContainer.add_child(this._popupLayout);
        global.stage.add_child(this._modalContainer);

        this._uiBuilder.positionPopup(
            this._modalContainer, this._popupLayout, x, y, monitor
        );

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
        this._searchEntry = null;
        this._pageIndicator = null;
        this._privateModeHint = null;
        this._currentPageItems = [];
        this._itemsToShow = [];
        this._originalItems = [];
    }

    // --- Search ---

    toggleSearch() {
        this._isSearchMode = !this._isSearchMode;
        this._searchEntry.visible = this._isSearchMode;
        if (this._isSearchMode) {
            global.stage.set_key_focus(this._searchEntry.get_clutter_text());
        } else {
            this.exitSearch();
        }
    }

    exitSearch() {
        this._isSearchMode = false;
        this._searchEntry.visible = false;
        this._searchEntry.set_text('');
        this._applySearch('');
        global.stage.set_key_focus(this._popupLayout);
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
            this.close();
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

        this._searchEntry = this._uiBuilder.createSearchEntry(
            (query) => this._applySearch(query),
            (event) => this._keyHandler.handleSearchKeyPress(event),
        );

        const { footerBox, privateModeHint, pageIndicator } = this._uiBuilder.createFooter();
        this._privateModeHint = privateModeHint;
        this._pageIndicator = pageIndicator;

        this._popupLayout.add_child(this._searchEntry);
        this._popupLayout.add_child(this._listContainer);
        this._popupLayout.add_child(footerBox);
    }

    // --- Private: rendering ---

    _renderPage() {
        this._listContainer.destroy_all_children();
        this._currentPageItems = [];

        const start = this._currentPage * ITEMS_PER_PAGE;
        const pageItems = this._itemsToShow.slice(start, start + ITEMS_PER_PAGE);

        pageItems.forEach((mItem, index) => {
            const itemBox = this._uiBuilder.createItemWidget(
                mItem, index, (item) => this._selectItem(item)
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
    }

    // --- Private: selection ---

    _selectItem(mItem) {
        this._parent._selectMenuItem(mItem, true);
        this._parent._moveItemFirst(mItem);
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
        this._selectedIndex = 0;
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
        if (this._maxPopupPages === -1) return totalAvailable;
        return this._maxPopupPages * ITEMS_PER_PAGE;
    }

    _getTotalPages() {
        return Math.ceil(this._itemsToShow.length / ITEMS_PER_PAGE) || 1;
    }
}
