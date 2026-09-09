/**
 * PopupKeyHandler - Handles keyboard events for the cursor popup.
 *
 * Delegates all actions back to the CursorPopup instance via its public API.
 */

import Clutter from 'gi://Clutter';

export class PopupKeyHandler {
    /**
     * @param {CursorPopup} popup - the owning CursorPopup instance
     */
    constructor(popup) {
        this._popup = popup;
    }

    /**
     * Handle key presses on the main popup (non-search mode).
     * All actions honor the user-customizable popup-local shortcuts
     * (see cursorPopup.isLocalShortcut); only digit-select and the
     * BackSpace-to-close behavior stay fixed.
     */
    handleMainKeyPress(_actor, event) {
        // In-field search toggles (also reachable when focus sits on a
        // toggle button rather than in the entry).
        if (this._handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this._popup.isLocalShortcut('close', event)) {
            this._popup.close();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('confirm', event)) {
            this._popup.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('search', event)) {
            this._popup.toggleSearch();
            return Clutter.EVENT_STOP;
        }

        // Delete/private-mode must not swallow keystrokes typed into the
        // search entry (the entry propagates them up here).
        if (!this._popup.isSearchMode) {
            if (this._popup.isLocalShortcut('deleteEntry', event)) {
                this._popup.deleteSelectedItem();
                return Clutter.EVENT_STOP;
            }

            if (this._popup.isLocalShortcut('privateMode', event)) {
                this._popup.togglePrivateMode();
                return Clutter.EVENT_STOP;
            }
        }

        if (this._popup.isLocalShortcut('pageNext', event)) {
            this._popup.navigatePageForward();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('pagePrevious', event)) {
            this._popup.navigatePageBack();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('moveUp', event)) {
            this._popup.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('moveDown', event)) {
            this._popup.navigateDown();
            return Clutter.EVENT_STOP;
        }

        const key = event.get_key_symbol();

        // Number keys select items directly
        if (key >= Clutter.KEY_0 && key <= Clutter.KEY_9) {
            this._popup.selectByNumberKey(key);
            return Clutter.EVENT_STOP;
        }

        if (key === Clutter.KEY_BackSpace) {
            if (!this._popup.isSearchMode) {
                this._popup.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * The in-field search-option shortcuts, only while search is active.
     * Returns true when the event was consumed.
     */
    _handleSearchToggleKeys(event) {
        if (!this._popup.isSearchMode)
            return false;
        if (this._popup.isLocalShortcut('caseSensitive', event)) {
            this._popup.toggleCaseSensitive();
            return true;
        }
        if (this._popup.isLocalShortcut('regex', event)) {
            this._popup.toggleRegex();
            return true;
        }
        return false;
    }

    /**
     * Handle key presses while the search entry is focused.
     */
    handleSearchKeyPress(event) {
        if (this._handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this._popup.isLocalShortcut('confirm', event)) {
            this._popup.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('close', event)) {
            this._popup.exitSearch();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('moveUp', event)) {
            this._popup.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this._popup.isLocalShortcut('moveDown', event)) {
            this._popup.navigateDown();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}
