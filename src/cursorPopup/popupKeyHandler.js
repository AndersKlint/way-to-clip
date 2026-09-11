import Clutter from 'gi://Clutter';

export class PopupKeyHandler {
    #popup;

    constructor(popup) {
        this.#popup = popup;
    }

    handleMainKeyPress(_actor, event) {
        // toggles work even when a toggle button has focus
        if (this._handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this.#popup.isLocalShortcut('close', event)) {
            this.#popup.close();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('confirm', event)) {
            this.#popup.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('search', event)) {
            this.#popup.toggleSearch();
            return Clutter.EVENT_STOP;
        }

        // don't eat keystrokes meant for the search field
        if (!this.#popup.isSearchMode) {
            if (this.#popup.isLocalShortcut('deleteEntry', event)) {
                this.#popup.deleteSelectedItem();
                return Clutter.EVENT_STOP;
            }

            if (this.#popup.isLocalShortcut('privateMode', event)) {
                this.#popup.togglePrivateMode();
                return Clutter.EVENT_STOP;
            }
        }

        if (this.#popup.isLocalShortcut('pageNext', event)) {
            this.#popup.navigatePageForward();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('pagePrevious', event)) {
            this.#popup.navigatePageBack();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('moveUp', event)) {
            this.#popup.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('moveDown', event)) {
            this.#popup.navigateDown();
            return Clutter.EVENT_STOP;
        }

        const key = event.get_key_symbol();

        if (key >= Clutter.KEY_0 && key <= Clutter.KEY_9) {
            this.#popup.selectByNumberKey(key);
            return Clutter.EVENT_STOP;
        }

        if (key === Clutter.KEY_BackSpace) {
            if (!this.#popup.isSearchMode) {
                this.#popup.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _handleSearchToggleKeys(event) {
        if (!this.#popup.isSearchMode)
            return false;
        if (this.#popup.isLocalShortcut('caseSensitive', event)) {
            this.#popup.toggleCaseSensitive();
            return true;
        }
        if (this.#popup.isLocalShortcut('regex', event)) {
            this.#popup.toggleRegex();
            return true;
        }
        return false;
    }

    handleSearchKeyPress(event) {
        if (this._handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this.#popup.isLocalShortcut('confirm', event)) {
            this.#popup.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('close', event)) {
            this.#popup.exitSearch();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('moveUp', event)) {
            this.#popup.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this.#popup.isLocalShortcut('moveDown', event)) {
            this.#popup.navigateDown();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}
