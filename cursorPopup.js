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
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PrefsFields } from './constants.js';

const ITEMS_PER_PAGE = 10;

export class CursorPopup {
    constructor(parent) {
        this._parent = parent;

        // Settings (updated via updateSettings)
        this._caseSensitiveSearch = false;
        this._regexSearch = false;
        this._autoPaste = true;
        this._maxPopupPages = 3;

        // UI state
        this._modalContainer = null;
        this._cursorPopup = null;
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

    /**
     * Update popup settings from GSettings. Call this whenever settings change.
     */
    updateSettings(settings) {
        this._caseSensitiveSearch = settings.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH);
        this._regexSearch = settings.get_boolean(PrefsFields.REGEX_SEARCH);
        this._autoPaste = settings.get_boolean(PrefsFields.AUTO_PASTE);
        this._maxPopupPages = settings.get_int(PrefsFields.MAX_POPUP_PAGES);
    }

    isOpen() {
        return this._cursorPopup !== null;
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

        this._modalContainer.add_child(this._cursorPopup);
        global.stage.add_child(this._modalContainer);

        this._positionPopup(x, y, monitor);

        this._modalContainer.connect('button-press-event', (_actor, event) => {
            const source = event.get_source();
            if (!this._cursorPopup.contains(source)) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._cursorPopup.connect('key-press-event', this._onKeyPress.bind(this));
        this._updatePrivateModeState();

        this._modalGrab = Main.pushModal(this._modalContainer);
        global.stage.set_key_focus(this._cursorPopup);
    }

    close() {
        if (!this._cursorPopup) return;

        if (this._modalGrab) {
            Main.popModal(this._modalGrab);
            this._modalGrab = null;
        }

        if (this._modalContainer) {
            global.stage.remove_child(this._modalContainer);
            this._modalContainer.destroy();
            this._modalContainer = null;
        }

        this._cursorPopup = null;
        this._listContainer = null;
        this._searchEntry = null;
        this._pageIndicator = null;
        this._privateModeHint = null;
        this._currentPageItems = [];
        this._itemsToShow = [];
        this._originalItems = [];
    }

    // --- Private: UI construction ---

    _buildUI() {
        this._modalContainer = new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });

        this._cursorPopup = new St.BoxLayout({
            style_class: 'waytoclip-cursor-popup',
            vertical: true,
            reactive: true,
        });

        this._listContainer = new St.BoxLayout({
            style_class: 'waytoclip-popup-list',
            vertical: true,
        });

        this._searchEntry = new St.Entry({
            style_class: 'waytoclip-search-entry',
            hint_text: _('Search...'),
            visible: false,
            x_expand: true,
        });

        this._searchEntry.get_clutter_text().connect('text-changed', (actor) => {
            this._performSearch(actor.get_text());
        });

        this._searchEntry.get_clutter_text().connect('key-press-event', (_actor, event) => {
            return this._onSearchKeyPress(event);
        });

        this._pageIndicator = new St.Label({
            style_class: 'waytoclip-page-indicator',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        const footerBox = this._buildFooter();

        this._cursorPopup.add_child(this._searchEntry);
        this._cursorPopup.add_child(this._listContainer);
        this._cursorPopup.add_child(footerBox);
    }

    _buildFooter() {
        const searchHint = new St.Label({
            text: '🔍 = s',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });

        this._privateModeHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });
        const privateIcon = new St.Icon({
            icon_name: 'security-medium-symbolic',
        });
        this._privateModeHint.add_child(privateIcon);
        this._privateModeHint.add_child(new St.Label({ text: ' = p' }));

        const deleteHint = new St.Label({
            text: '🗑 = d',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.END,
        });

        const footerBox = new St.BoxLayout({ x_expand: true });
        footerBox.add_child(searchHint);
        footerBox.add_child(this._privateModeHint);
        footerBox.add_child(this._pageIndicator);
        footerBox.add_child(deleteHint);

        return footerBox;
    }

    _positionPopup(x, y, monitor) {
        const [, natW] = this._cursorPopup.get_preferred_width(-1);
        const [, natH] = this._cursorPopup.get_preferred_height(natW);

        // Position the modal container to cover the monitor
        this._modalContainer.set_position(monitor.x, monitor.y);
        this._modalContainer.set_size(monitor.width, monitor.height);

        // Compute popup position relative to monitor
        let popupX = x - monitor.x;
        let popupY = y - monitor.y - natH - 10;

        // Clamp horizontally
        popupX = Math.max(10, Math.min(popupX, monitor.width - natW - 10));

        // Flip below cursor if no room above
        if (popupY < 10) {
            popupY = y - monitor.y + 20;
        }

        // Clamp vertically
        if (popupY + natH > monitor.height - 10) {
            popupY = Math.max(10, monitor.height - natH - 10);
        }

        this._cursorPopup.set_position(popupX, popupY);
    }

    // --- Private: rendering ---

    _renderPage() {
        this._listContainer.destroy_all_children();
        this._currentPageItems = [];

        const start = this._currentPage * ITEMS_PER_PAGE;
        const pageItems = this._itemsToShow.slice(start, start + ITEMS_PER_PAGE);

        pageItems.forEach((mItem, index) => {
            const itemBox = this._createItemWidget(mItem, index);

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

    _createItemWidget(mItem, index) {
        const itemBox = new St.BoxLayout({
            style_class: 'waytoclip-popup-item',
            reactive: true,
            x_expand: true,
            track_hover: true,
            vertical: true,
        });

        const topRow = new St.BoxLayout({
            x_expand: true,
            vertical: false,
        });

        const numberLabel = new St.Label({
            text: `${(index + 1) % 10}. `,
            style_class: 'waytoclip-item-number',
            y_align: Clutter.ActorAlign.START,
        });

        const textContainer = new St.BoxLayout({
            style_class: 'waytoclip-item-text-container',
            vertical: true,
            x_expand: true,
        });

        const textLabel = new St.Label({
            text: mItem.entry.getStringValue(),
            style_class: 'waytoclip-item-text',
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        textLabel.get_clutter_text().set_line_wrap(true);
        textLabel.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        textLabel.get_clutter_text().set_ellipsize(Pango.EllipsizeMode.END);

        textContainer.add_child(textLabel);
        topRow.add_child(numberLabel);
        topRow.add_child(textContainer);
        itemBox.add_child(topRow);

        itemBox.connect('button-press-event', () => {
            this._selectItem(mItem);
            return Clutter.EVENT_STOP;
        });

        return itemBox;
    }

    // --- Private: selection ---

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

    _selectItem(mItem) {
        this._parent._selectMenuItem(mItem, true);
        this._parent._moveItemFirst(mItem);
        if (this._autoPaste) {
            this._parent.autoPasteAndClose(mItem);
        } else {
            this.close();
        }
    }

    /**
     * Select the currently highlighted item (Enter key action).
     */
    _confirmSelection() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;
        const start = this._currentPage * ITEMS_PER_PAGE;
        this._selectItem(this._itemsToShow[start + this._selectedIndex]);
    }

    /**
     * Select an item by its number key (0-9).
     * Keys 1-9 map to indices 0-8, key 0 maps to index 9.
     */
    _selectByNumberKey(keySymbol) {
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

    // --- Private: navigation ---

    _navigateUp() {
        const len = this._currentPageItems.length;
        if (len === 0) return;
        this._updateSelection(this._selectedIndex <= 0 ? len - 1 : this._selectedIndex - 1);
    }

    _navigateDown() {
        const len = this._currentPageItems.length;
        if (len === 0) return;
        this._updateSelection(this._selectedIndex >= len - 1 ? 0 : this._selectedIndex + 1);
    }

    _navigatePageForward() {
        const totalPages = this._getTotalPages();
        if (totalPages <= 1) return;
        this._currentPage = (this._currentPage + 1) % totalPages;
        this._selectedIndex = 0;
        this._renderPage();
    }

    _navigatePageBack() {
        const totalPages = this._getTotalPages();
        if (totalPages <= 1) return;
        this._currentPage = (this._currentPage - 1 + totalPages) % totalPages;
        this._selectedIndex = 0;
        this._renderPage();
    }

    // --- Private: search ---

    _toggleSearch() {
        this._isSearchMode = !this._isSearchMode;
        this._searchEntry.visible = this._isSearchMode;
        if (this._isSearchMode) {
            global.stage.set_key_focus(this._searchEntry.get_clutter_text());
        } else {
            this._exitSearch();
        }
    }

    _exitSearch() {
        this._isSearchMode = false;
        this._searchEntry.visible = false;
        this._searchEntry.set_text('');
        this._performSearch('');
        global.stage.set_key_focus(this._cursorPopup);
    }

    _performSearch(query) {
        const normalizedQuery = this._caseSensitiveSearch ? query : query.toLowerCase();

        let filteredItems;
        if (normalizedQuery === '') {
            filteredItems = this._originalItems;
        } else {
            filteredItems = this._originalItems.filter(mItem => {
                let text = mItem.clipContents || mItem.entry.getStringValue();
                if (!this._caseSensitiveSearch) text = text.toLowerCase();

                if (this._regexSearch) {
                    try {
                        const flags = this._caseSensitiveSearch ? '' : 'i';
                        const regex = new RegExp(normalizedQuery, flags);
                        return regex.test(text);
                    } catch (_e) {
                        // Invalid regex; fall back to literal match
                        return text.includes(normalizedQuery);
                    }
                }
                return text.includes(normalizedQuery);
            });
        }

        this._itemsToShow = filteredItems.slice(0, this._getMaxItems(filteredItems.length));
        this._currentPage = 0;
        this._selectedIndex = 0;
        this._renderPage();
    }

    // --- Private: deletion ---

    _deleteSelectedItem() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;

        const start = this._currentPage * ITEMS_PER_PAGE;
        const target = this._itemsToShow[start + this._selectedIndex];
        this._parent._removeEntry(target, 'delete');

        // Refresh items from the parent, preserving active search filter
        const updatedItems = this._parent._getAllIMenuItems().filter(item => item.actor.visible);
        this._originalItems = updatedItems;

        if (this._isSearchMode && this._searchEntry.get_text() !== '') {
            // Re-apply the current search filter
            this._performSearch(this._searchEntry.get_text());
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

    // --- Private: key handling ---

    _onKeyPress(_actor, event) {
        const key = event.get_key_symbol();

        // Number keys select items directly
        if (key >= Clutter.KEY_0 && key <= Clutter.KEY_9) {
            this._selectByNumberKey(key);
            return Clutter.EVENT_STOP;
        }

        switch (key) {
            case Clutter.KEY_Escape:
                this.close();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_BackSpace:
                if (!this._isSearchMode) {
                    this.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;

            case Clutter.KEY_s:
                this._toggleSearch();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_d:
                if (this._isSearchMode) return Clutter.EVENT_PROPAGATE;
                this._deleteSelectedItem();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_p:
                if (this._isSearchMode) return Clutter.EVENT_PROPAGATE;
                this._parent.togglePrivateMode();
                this._updatePrivateModeState();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Tab:
            case Clutter.KEY_Right:
                this._navigatePageForward();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_ISO_Left_Tab:
            case Clutter.KEY_Left:
                this._navigatePageBack();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Up:
                this._navigateUp();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Down:
                this._navigateDown();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._confirmSelection();
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onSearchKeyPress(event) {
        const key = event.get_key_symbol();

        switch (key) {
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._confirmSelection();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Escape:
                this._exitSearch();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Up:
                this._navigateUp();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Down:
                this._navigateDown();
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
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
     * @param {number} totalAvailable - total items available
     * @returns {number}
     */
    _getMaxItems(totalAvailable) {
        if (this._maxPopupPages === -1) return totalAvailable;
        return this._maxPopupPages * ITEMS_PER_PAGE;
    }

    _getTotalPages() {
        return Math.ceil(this._itemsToShow.length / ITEMS_PER_PAGE) || 1;
    }
}
