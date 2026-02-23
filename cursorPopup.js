/**
 * CursorPopup - Handles the cursor-positioned popup for quick clipboard selection
 * 
 * Features:
 * - Paged display (9 items per page)
 * - Keyboard navigation (Up/Down, Tab/Shift+Tab for pages)
 * - Search functionality (press 's')
 * - Delete items (press 'd')
 * - Click outside to close
 * - Auto-paste support
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { PrefsFields } from './constants.js';

/** @type {boolean} Case-sensitive search setting */
let CASE_SENSITIVE_SEARCH = false;
/** @type {boolean} Regex search setting */
let REGEX_SEARCH = false;
/** @type {boolean} Auto-paste after selection */
let AUTO_PASTE = true;
/** @type {number} Number of pages (9 items each) */
let POPUP_PAGES = 3;

/**
 * Initialize popup settings from main settings object
 * @param {Gio.Settings} settings - Main extension settings
 */
export function initPopupSettings(settings) {
    CASE_SENSITIVE_SEARCH = settings.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH);
    REGEX_SEARCH = settings.get_boolean(PrefsFields.REGEX_SEARCH);
    AUTO_PASTE = settings.get_boolean(PrefsFields.AUTO_PASTE);
    POPUP_PAGES = settings.get_int(PrefsFields.POPUP_PAGES);
}

/**
 * CursorPopup class - Manages the floating popup window
 */
export class CursorPopup {
    /**
     * @param {Object} parent - Parent WayToClip instance
     */
    constructor(parent) {
        this.parent = parent;
        this._cursorPopup = null;
        this._cursorPopupClickedId = null;
    }

    /**
     * Open the cursor popup at specified position
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Array} items - Items to display
     * @param {Object} monitor - Monitor geometry
     */
    open(x, y, items, monitor) {
        if (items.length === 0) {
            this.parent._showNotification(_("Clipboard is empty"));
            return;
        }

        const maxItems = POPUP_PAGES * 9;
        const itemsToShow = [...items.slice(0, maxItems)];

        let currentPage = 0;
        let selectedIndex = -1;
        let currentPageItems = [];
        let isSearchMode = false;

        this._cursorPopup = new St.BoxLayout({
            style_class: 'waytoclip-cursor-popup',
            vertical: true,
            reactive: true,
            can_focus: true,
        });

        const listContainer = new St.BoxLayout({
            style_class: 'waytoclip-popup-list',
            vertical: true,
            reactive: true,
        });

        const searchEntry = new St.Entry({
            style_class: 'waytoclip-search-entry',
            hint_text: _('Search...'),
            visible: false,
            x_expand: true,
        });

        const searchHint = new St.Label({
            text: '🔍 = s',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });

        const pageIndicator = new St.Label({
            style_class: 'waytoclip-page-indicator',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        const deleteHint = new St.Label({
            text: '🗑 = d',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.END,
        });

        const footerBox = new St.BoxLayout({ x_expand: true });
        footerBox.add_child(searchHint);
        footerBox.add_child(pageIndicator);
        footerBox.add_child(deleteHint);

        const updateSelection = (newIndex) => {
            currentPageItems.forEach((item, i) => {
                if (i === newIndex) {
                    item.add_style_pseudo_class('selected');
                    item.add_style_pseudo_class('focus');
                } else {
                    item.remove_style_pseudo_class('selected');
                    item.remove_style_pseudo_class('focus');
                }
            });
            selectedIndex = newIndex;
        };

        const performSearch = (query) => {
            if (!CASE_SENSITIVE_SEARCH) query = query.toLowerCase();

            let filteredItems;
            if (query === '') {
                filteredItems = items;
            } else {
                filteredItems = items.filter(mItem => {
                    let text = mItem.clipContents || mItem.entry.getStringValue();
                    if (!CASE_SENSITIVE_SEARCH) text = text.toLowerCase();

                    if (REGEX_SEARCH) {
                        try {
                            const regex = new RegExp(query, CASE_SENSITIVE_SEARCH ? 'm' : 'mi');
                            return regex.test(text);
                        } catch (e) {
                            return text.includes(query);
                        }
                    }
                    return text.includes(query);
                });
            }

            itemsToShow.length = 0;
            itemsToShow.push(...filteredItems.slice(0, maxItems));

            currentPage = 0;
            const newTotalPages = Math.ceil(itemsToShow.length / 9) || 1;
            pageIndicator.set_text(`${currentPage + 1} / ${newTotalPages}`);
            pageIndicator.visible = itemsToShow.length > 0;

            renderPage(currentPage);
            updateSelection(0);
        };

        searchEntry.get_clutter_text().connect('text-changed', (actor) => {
            performSearch(actor.get_text());
        });

        searchEntry.get_clutter_text().connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                isSearchMode = false;
                searchEntry.visible = false;
                searchEntry.set_text('');
                performSearch('');
                this._cursorPopup.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const renderPage = (pageIndex) => {
            listContainer.destroy_all_children();
            currentPageItems = [];
            const start = pageIndex * 9;
            const pageItems = itemsToShow.slice(start, start + 9);

            pageItems.forEach((mItem, index) => {
                const itemBox = new St.BoxLayout({
                    style_class: 'waytoclip-popup-item',
                    reactive: true,
                    x_expand: true,
                });

                const numberLabel = new St.Label({
                    text: `${index + 1}. `,
                    style_class: 'waytoclip-item-number',
                    y_align: Clutter.ActorAlign.CENTER,
                });

                const textLabel = new St.Label({
                    text: this.parent._truncate(mItem.entry.getStringValue(), 50),
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                });

                itemBox.add_child(numberLabel);
                itemBox.add_child(textLabel);

                itemBox.connect('button-press-event', () => {
                    this.parent._selectMenuItem(mItem, true);
                    if (AUTO_PASTE) {
                        this.parent._autoPasteAndClose(mItem);
                    } else {
                        this.close();
                    }
                });

                listContainer.add_child(itemBox);
                currentPageItems.push(itemBox);
            });

            const pageCount = Math.ceil(itemsToShow.length / 9);
            pageIndicator.set_text(`${pageIndex + 1} / ${pageCount}`);
            pageIndicator.visible = itemsToShow.length > 0;
        };

        this._cursorPopup.add_child(searchEntry);
        this._cursorPopup.add_child(listContainer);
        this._cursorPopup.add_child(footerBox);

        renderPage(currentPage);
        updateSelection(0);

        global.stage.add_child(this._cursorPopup);

        const [popupWidth, popupHeight] = this._cursorPopup.get_size();
        let popupX = x;
        let popupY = y - popupHeight - 10;

        if (popupX + popupWidth > monitor.x + monitor.width) {
            popupX = monitor.x + monitor.width - popupWidth - 10;
        }
        if (popupX < monitor.x) {
            popupX = monitor.x + 10;
        }
        if (popupY < monitor.y) {
            popupY = y + 20;
        }

        this._cursorPopup.set_position(popupX, popupY);
        this._cursorPopup.grab_key_focus();

        this._cursorPopup.connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();
            const state = event.get_state();
            const currentTotalPages = Math.ceil(itemsToShow.length / 9);

            if (key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
                const idx = key - Clutter.KEY_1;
                const start = currentPage * 9;
                if (start + idx < itemsToShow.length) {
                    const target = itemsToShow[start + idx];
                    this.parent._selectMenuItem(target, true);
                    if (AUTO_PASTE) {
                        this.parent._autoPasteAndClose(target);
                    }
                    this.close();
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_Escape) {
                if (isSearchMode) {
                    isSearchMode = false;
                    searchEntry.visible = false;
                    searchEntry.set_text('');
                    performSearch('');
                } else {
                    this.close();
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_BackSpace) {
                if (isSearchMode && searchEntry.get_text() === '') {
                    isSearchMode = false;
                    searchEntry.visible = false;
                    performSearch('');
                } else if (!isSearchMode) {
                    this.close();
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_s) {
                isSearchMode = !isSearchMode;
                searchEntry.visible = isSearchMode;
                if (isSearchMode) {
                    global.stage.set_key_focus(searchEntry.get_clutter_text());
                } else {
                    searchEntry.set_text('');
                    performSearch('');
                    this._cursorPopup.grab_key_focus();
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_d) {
                if (selectedIndex >= 0 && selectedIndex < currentPageItems.length) {
                    const start = currentPage * 9;
                    const target = itemsToShow[start + selectedIndex];
                    this.parent._removeEntry(target, 'delete');

                    const updatedItems = this.parent._getAllIMenuItems()
                        .filter(item => item.actor.visible);
                    const newMaxItems = POPUP_PAGES * 9;
                    itemsToShow.length = 0;
                    itemsToShow.push(...updatedItems.slice(0, newMaxItems));

                    if (itemsToShow.length === 0) {
                        this.close();
                        return Clutter.EVENT_STOP;
                    }

                    const newPageCount = Math.ceil(itemsToShow.length / 9);
                    if (currentPage >= newPageCount) {
                        currentPage = newPageCount - 1;
                    }
                    if (currentPage < 0) currentPage = 0;

                    pageIndicator.set_text(`${currentPage + 1} / ${newPageCount}`);
                    pageIndicator.visible = itemsToShow.length > 0;

                    renderPage(currentPage);
                    const newSelectedIndex = selectedIndex < currentPageItems.length 
                        ? selectedIndex 
                        : currentPageItems.length - 1;
                    updateSelection(newSelectedIndex);
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_Tab || key === Clutter.KEY_Right) {
                if (currentTotalPages > 1) {
                    currentPage = (currentPage + 1) % currentTotalPages;
                    renderPage(currentPage);
                    updateSelection(0);
                }
                return Clutter.EVENT_STOP;
            } else if ((key === Clutter.KEY_ISO_Left_Tab || key === Clutter.KEY_Left) && 
                       (state & Clutter.ModifierType.SHIFT_MASK || key === Clutter.KEY_Left)) {
                if (currentTotalPages > 1) {
                    currentPage = (currentPage - 1 + currentTotalPages) % currentTotalPages;
                    renderPage(currentPage);
                    updateSelection(0);
                }
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_Up) {
                const maxIndex = currentPageItems.length - 1;
                const newIndex = selectedIndex <= 0 ? maxIndex : selectedIndex - 1;
                updateSelection(newIndex);
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_Down) {
                const maxIndex = currentPageItems.length - 1;
                const newIndex = selectedIndex >= maxIndex ? 0 : selectedIndex + 1;
                updateSelection(newIndex);
                return Clutter.EVENT_STOP;
            } else if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                if (selectedIndex >= 0 && selectedIndex < currentPageItems.length) {
                    const start = currentPage * 9;
                    const target = itemsToShow[start + selectedIndex];
                    this.parent._selectMenuItem(target, true);
                    if (AUTO_PASTE) {
                        this.parent._autoPasteAndClose(target);
                    }
                    this.close();
                }
                return Clutter.EVENT_STOP;
            }
        });

        this._cursorPopupClickedId = global.stage.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                const [clickX, clickY] = event.get_coords();
                const [popupX, popupY] = this._cursorPopup.get_position();
                const [popupWidth, popupHeight] = this._cursorPopup.get_size();

                if (clickX < popupX || clickX > popupX + popupWidth ||
                    clickY < popupY || clickY > popupY + popupHeight) {
                    this.close();
                    return Clutter.EVENT_PROPAGATE;
                }
                return Clutter.EVENT_PROPAGATE;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    /**
     * Close the popup and clean up
     */
    close() {
        if (this._cursorPopup) {
            if (this._cursorPopupClickedId) {
                global.stage.disconnect(this._cursorPopupClickedId);
                this._cursorPopupClickedId = null;
            }
            global.stage.remove_child(this._cursorPopup);
            this._cursorPopup.destroy();
            this._cursorPopup = null;
        }
    }
}
