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
     */
    handleMainKeyPress(_actor, event) {
        const key = event.get_key_symbol();

        // In-field search toggles (also reachable when focus sits on a
        // toggle button rather than in the entry).
        if (this._handleSearchToggleKeys(event, key))
            return Clutter.EVENT_STOP;

        // Number keys select items directly
        if (key >= Clutter.KEY_0 && key <= Clutter.KEY_9) {
            this._popup.selectByNumberKey(key);
            return Clutter.EVENT_STOP;
        }

        switch (key) {
            case Clutter.KEY_Escape:
                this._popup.close();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_BackSpace:
                if (!this._popup.isSearchMode) {
                    this._popup.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;

            case Clutter.KEY_s:
                this._popup.toggleSearch();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_d:
                if (this._popup.isSearchMode) return Clutter.EVENT_PROPAGATE;
                this._popup.deleteSelectedItem();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_p:
                if (this._popup.isSearchMode) return Clutter.EVENT_PROPAGATE;
                this._popup.togglePrivateMode();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Tab:
            case Clutter.KEY_Right:
                this._popup.navigatePageForward();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_ISO_Left_Tab:
            case Clutter.KEY_Left:
                this._popup.navigatePageBack();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Up:
                this._popup.navigateUp();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Down:
                this._popup.navigateDown();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._popup.confirmSelection();
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Whether Alt is held for the given key event.
     */
    _hasAltModifier(event) {
        try {
            if (typeof event.get_state !== 'function')
                return false;
            return (event.get_state() & Clutter.ModifierType.MOD1_MASK) !== 0;
        } catch (_e) {
            return false;
        }
    }

    /**
     * Alt+C / Alt+R toggle the in-field search options, but only while
     * search is active. Returns true when the event was consumed.
     */
    _handleSearchToggleKeys(event, key) {
        if (!this._popup.isSearchMode || !this._hasAltModifier(event))
            return false;
        if (key === Clutter.KEY_c || key === Clutter.KEY_C) {
            this._popup.toggleCaseSensitive();
            return true;
        }
        if (key === Clutter.KEY_r || key === Clutter.KEY_R) {
            this._popup.toggleRegex();
            return true;
        }
        return false;
    }

    /**
     * Handle key presses while the search entry is focused.
     */
    handleSearchKeyPress(event) {
        const key = event.get_key_symbol();

        if (this._handleSearchToggleKeys(event, key))
            return Clutter.EVENT_STOP;

        switch (key) {
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._popup.confirmSelection();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Escape:
                this._popup.exitSearch();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Up:
                this._popup.navigateUp();
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Down:
                this._popup.navigateDown();
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}
