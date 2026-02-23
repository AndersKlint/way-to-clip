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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PrefsFields } from './constants.js';

let CASE_SENSITIVE_SEARCH = false;
let REGEX_SEARCH = false;
let AUTO_PASTE = true;
let POPUP_PAGES = 3;

export function initPopupSettings(settings) {
    CASE_SENSITIVE_SEARCH = settings.get_boolean(PrefsFields.CASE_SENSITIVE_SEARCH);
    REGEX_SEARCH = settings.get_boolean(PrefsFields.REGEX_SEARCH);
    AUTO_PASTE = settings.get_boolean(PrefsFields.AUTO_PASTE);
    POPUP_PAGES = settings.get_int(PrefsFields.POPUP_PAGES);
}

export class CursorPopup {
    constructor(parent) {
        this.parent = parent;
        this._cursorPopup = null;
        this._eventId = null;
        this._itemsToShow = [];
        this._currentPage = 0;
        this._selectedIndex = -1;
        this._currentPageItems = [];
        this._isSearchMode = false;
    }

    isOpen() {
        return this._cursorPopup !== null;
    }

    open(x, y, items, monitor) {
        if (items.length === 0) {
            this.parent._showNotification(_("Clipboard is empty"));
            return;
        }

        const maxItems = POPUP_PAGES * 9;
        this._itemsToShow = [...items.slice(0, maxItems)];
        this._currentPage = 0;
        this._selectedIndex = 0;
        this._currentPageItems = [];
        this._isSearchMode = false;
        this._originalItems = items;

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

        const searchHint = new St.Label({
            text: '🔍 = s',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });

        this._pageIndicator = new St.Label({
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
        footerBox.add_child(this._pageIndicator);
        footerBox.add_child(deleteHint);

        this._searchEntry.get_clutter_text().connect('text-changed', (actor) => {
            this._performSearch(actor.get_text());
        });

        this._searchEntry.get_clutter_text().connect('key-press-event', (actor, event) => {
            const key = event.get_key_symbol();

            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                if (this._selectedIndex >= 0 && this._selectedIndex < this._currentPageItems.length) {
                    const start = this._currentPage * 9;
                    const target = this._itemsToShow[start + this._selectedIndex];
                    this._selectItem(target);
                }
                return Clutter.EVENT_STOP;
            }

            if (key === Clutter.KEY_Escape) {
                this._isSearchMode = false;
                this._searchEntry.visible = false;
                this._searchEntry.set_text('');
                this._performSearch('');
                global.stage.set_key_focus(this._cursorPopup);
                return Clutter.EVENT_STOP;
            }

            if (key === Clutter.KEY_Up || key === Clutter.KEY_Down) {
                if (key === Clutter.KEY_Up) {
                    this._updateSelection(this._selectedIndex <= 0 ? this._currentPageItems.length - 1 : this._selectedIndex - 1);
                } else {
                    this._updateSelection(this._selectedIndex >= this._currentPageItems.length - 1 ? 0 : this._selectedIndex + 1);
                }
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });

        this._cursorPopup.add_child(this._searchEntry);
        this._cursorPopup.add_child(this._listContainer);
        this._cursorPopup.add_child(footerBox);

        this._renderPage();

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

        Main.pushModal(this._cursorPopup, { actionMode: 0 });
        global.stage.set_key_focus(this._cursorPopup);

        this._eventId = global.stage.connect('captured-event', this._onCapturedEvent.bind(this));
        this._cursorPopup.connect('key-press-event', this._onKeyPress.bind(this));
        this._cursorPopup.connect('destroy', () => {
            this._cleanup();
        });
    }

    _cleanup() {
        if (this._eventId) {
            global.stage.disconnect(this._eventId);
            this._eventId = null;
        }
        if (this._cursorPopup) {
            try {
                Main.popModal(this._cursorPopup);
            } catch (e) {}
        }
    }

    _updateSelection(newIndex) {
        this._currentPageItems.forEach((item, i) => {
            if (i === newIndex) {
                item.add_style_pseudo_class('selected');
                item.add_style_pseudo_class('focus');
            } else {
                item.remove_style_pseudo_class('selected');
                item.remove_style_pseudo_class('focus');
            }
        });
        this._selectedIndex = newIndex;
    }

    _performSearch(query) {
        if (!CASE_SENSITIVE_SEARCH) query = query.toLowerCase();

        let filteredItems;
        if (query === '') {
            filteredItems = this._originalItems;
        } else {
            filteredItems = this._originalItems.filter(mItem => {
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

        const maxItems = POPUP_PAGES * 9;
        this._itemsToShow = filteredItems.slice(0, maxItems);
        this._currentPage = 0;
        this._selectedIndex = 0;

        this._renderPage();
    }

    _renderPage() {
        this._listContainer.destroy_all_children();
        this._currentPageItems = [];
        const start = this._currentPage * 9;
        const pageItems = this._itemsToShow.slice(start, start + 9);

        pageItems.forEach((mItem, index) => {
            const itemBox = new St.BoxLayout({
                style_class: 'waytoclip-popup-item',
                reactive: true,
                x_expand: true,
                track_hover: true,
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

            itemBox._menuItem = mItem;

            itemBox.connect('button-press-event', () => {
                this._selectItem(mItem);
                return Clutter.EVENT_STOP;
            });

            if (index === this._selectedIndex) {
                itemBox.add_style_pseudo_class('selected');
                itemBox.add_style_pseudo_class('focus');
            }

            this._listContainer.add_child(itemBox);
            this._currentPageItems.push(itemBox);
        });

        const pageCount = Math.ceil(this._itemsToShow.length / 9) || 1;
        this._pageIndicator.set_text(`${this._currentPage + 1} / ${pageCount}`);
        this._pageIndicator.visible = this._itemsToShow.length > 0;
    }

    _onCapturedEvent(actor, event) {
        const type = event.type();

        if (type === Clutter.EventType.BUTTON_PRESS) {
            const [clickX, clickY] = event.get_coords();
            const [popupX, popupY] = this._cursorPopup.get_position();
            const [popupWidth, popupHeight] = this._cursorPopup.get_size();

            if (clickX < popupX || clickX > popupX + popupWidth ||
                clickY < popupY || clickY > popupY + popupHeight) {
                this.close();
                return Clutter.EVENT_STOP;
            }

            const source = event.get_source();
            let current = source;
            while (current) {
                if (current._menuItem) {
                    this._selectItem(current._menuItem);
                    return Clutter.EVENT_STOP;
                }
                current = current.get_parent();
            }

            return Clutter.EVENT_STOP;
        }

        if (type === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            
            if (this._isSearchMode) {
                if (key === Clutter.KEY_Escape) {
                    this._isSearchMode = false;
                    this._searchEntry.visible = false;
                    this._searchEntry.set_text('');
                    this._performSearch('');
                    global.stage.set_key_focus(this._cursorPopup);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onKeyPress(actor, event) {
        const key = event.get_key_symbol();
        const state = event.get_state();
        const currentTotalPages = Math.ceil(this._itemsToShow.length / 9) || 1;

        if (key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
            const idx = key - Clutter.KEY_1;
            const start = this._currentPage * 9;
            if (start + idx < this._itemsToShow.length) {
                const target = this._itemsToShow[start + idx];
                this._selectItem(target);
            }
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
                this._isSearchMode = !this._isSearchMode;
                this._searchEntry.visible = this._isSearchMode;
                if (this._isSearchMode) {
                    global.stage.set_key_focus(this._searchEntry.get_clutter_text());
                } else {
                    this._searchEntry.set_text('');
                    this._performSearch('');
                    global.stage.set_key_focus(this._cursorPopup);
                }
                return Clutter.EVENT_STOP;

            case Clutter.KEY_d:
                this._deleteSelectedItem();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Tab:
            case Clutter.KEY_Right:
                if (currentTotalPages > 1) {
                    this._currentPage = (this._currentPage + 1) % currentTotalPages;
                    this._selectedIndex = 0;
                    this._renderPage();
                }
                return Clutter.EVENT_STOP;

            case Clutter.KEY_ISO_Left_Tab:
            case Clutter.KEY_Left:
                if (currentTotalPages > 1) {
                    this._currentPage = (this._currentPage - 1 + currentTotalPages) % currentTotalPages;
                    this._selectedIndex = 0;
                    this._renderPage();
                }
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Up:
                this._updateSelection(this._selectedIndex <= 0 ? this._currentPageItems.length - 1 : this._selectedIndex - 1);
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Down:
                this._updateSelection(this._selectedIndex >= this._currentPageItems.length - 1 ? 0 : this._selectedIndex + 1);
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                if (this._selectedIndex >= 0 && this._selectedIndex < this._currentPageItems.length) {
                    const start = this._currentPage * 9;
                    const target = this._itemsToShow[start + this._selectedIndex];
                    this._selectItem(target);
                }
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _selectItem(mItem) {
        this.parent._selectMenuItem(mItem, true);
        if (AUTO_PASTE) {
            this.parent.autoPasteAndClose(mItem);
        } else {
            this.close();
        }
    }

    _deleteSelectedItem() {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._currentPageItems.length) return;

        const start = this._currentPage * 9;
        const target = this._itemsToShow[start + this._selectedIndex];
        this.parent._removeEntry(target, 'delete');

        const updatedItems = this.parent._getAllIMenuItems().filter(item => item.actor.visible);
        const maxItems = POPUP_PAGES * 9;
        this._itemsToShow = updatedItems.slice(0, maxItems);
        this._originalItems = updatedItems;

        if (this._itemsToShow.length === 0) {
            this.close();
            return;
        }

        const newPageCount = Math.ceil(this._itemsToShow.length / 9) || 1;
        if (this._currentPage >= newPageCount) {
            this._currentPage = newPageCount - 1;
        }

        if (this._selectedIndex >= this._currentPageItems.length) {
            this._selectedIndex = this._currentPageItems.length - 1;
        }

        this._renderPage();
    }

    close() {
        if (!this._cursorPopup) return;

        this._cleanup();

        global.stage.remove_child(this._cursorPopup);
        this._cursorPopup.destroy();
        this._cursorPopup = null;
        this._currentPageItems = [];
    }
}
