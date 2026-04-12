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
     * Handle key presses while the search entry is focused.
     */
    handleSearchKeyPress(event) {
        const key = event.get_key_symbol();

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
