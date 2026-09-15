import Clutter from 'gi://Clutter';

export class PopupKeyHandler {
    #popup;
    #shortcuts;
    #search;
    #selection;

    constructor({ popup, shortcuts, search, selection }) {
        this.#popup = popup;
        this.#shortcuts = shortcuts;
        this.#search = search;
        this.#selection = selection;
    }

    handleMainKeyPress(_actor, event) {
        // toggles work even when a toggle button has focus
        if (this.#handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this.#shortcuts.isLocalShortcut('close', event)) {
            this.#popup.close();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('confirm', event)) {
            this.#selection.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('search', event)) {
            this.#search.toggleSearch();
            return Clutter.EVENT_STOP;
        }

        // don't eat keystrokes meant for the search field
        if (!this.#search.isSearchMode) {
            if (this.#shortcuts.isLocalShortcut('deleteEntry', event)) {
                this.#selection.deleteSelectedItem();
                return Clutter.EVENT_STOP;
            }

            if (this.#shortcuts.isLocalShortcut('privateMode', event)) {
                this.#popup.togglePrivateMode();
                return Clutter.EVENT_STOP;
            }

            if (this.#shortcuts.isLocalShortcut('toggleFavorite', event)) {
                this.#selection.toggleFavoriteSelected();
                return Clutter.EVENT_STOP;
            }

            if (this.#shortcuts.isLocalShortcut('favoritesView', event)) {
                this.#selection.toggleFavoritesView();
                return Clutter.EVENT_STOP;
            }
        }

        if (this.#shortcuts.isLocalShortcut('pageNext', event)) {
            this.#selection.navigatePageForward();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('pagePrevious', event)) {
            this.#selection.navigatePageBack();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('moveUp', event)) {
            this.#selection.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('moveDown', event)) {
            this.#selection.navigateDown();
            return Clutter.EVENT_STOP;
        }

        const key = event.get_key_symbol();

        if (key >= Clutter.KEY_0 && key <= Clutter.KEY_9) {
            this.#selection.selectByNumberKey(key);
            return Clutter.EVENT_STOP;
        }

        if (key === Clutter.KEY_BackSpace) {
            if (!this.#search.isSearchMode) {
                this.#popup.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    #handleSearchToggleKeys(event) {
        if (!this.#search.isSearchMode)
            return false;
        if (this.#shortcuts.isLocalShortcut('caseSensitive', event)) {
            this.#search.toggleCaseSensitiveSearch();
            return true;
        }
        if (this.#shortcuts.isLocalShortcut('regex', event)) {
            this.#search.toggleRegexSearch();
            return true;
        }
        return false;
    }

    handleSearchKeyPress(event) {
        if (this.#handleSearchToggleKeys(event))
            return Clutter.EVENT_STOP;

        if (this.#shortcuts.isLocalShortcut('confirm', event)) {
            this.#selection.confirmSelection();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('close', event)) {
            this.#search.exitSearch();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('moveUp', event)) {
            this.#selection.navigateUp();
            return Clutter.EVENT_STOP;
        }

        if (this.#shortcuts.isLocalShortcut('moveDown', event)) {
            this.#selection.navigateDown();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}
