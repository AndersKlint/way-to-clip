import { ITEMS_PER_PAGE } from '../common/constants.js';

// Boundary keysyms for the digit keys: 1 starts the zero-based index range,
// while 0 is handled specially because it selects the tenth popup item.
// See selectByNumberKey method below.
const KEY_0 = 0x30;
const KEY_1 = 0x31;

// This class handles visible clipboard items, paging, highlight, and delete. 
export class PopupSelectionController {
    #handlers;
    #popup;
    #search;
    #originalItems = [];
    #itemsToShow = [];
    #currentPage = 0;
    #selectedIndex = -1;
    #currentPageItems = [];
    #limitPopupPages = false;
    #maxPopupPages = 3;
    #favoritesOnly = false;
    #favoritesEnabled = true;

    constructor({ handlers, popup, search }) {
        this.#handlers = handlers;
        this.#popup = popup;
        this.#search = search;
    }

    get originalItems() {
        return this.#originalItems;
    }

    get itemsToShow() {
        return this.#itemsToShow;
    }

    get currentPage() {
        return this.#currentPage;
    }

    get selectedIndex() {
        return this.#selectedIndex;
    }

    get currentPageItems() {
        return this.#currentPageItems;
    }

    get originalCount() {
        return this.#originalItems.length;
    }

    get isFavoritesView() {
        return this.#favoritesOnly;
    }

    get favoritesEnabled() {
        return this.#favoritesEnabled;
    }

    getSelectedEntry() {
        return this.#getSelectedTarget();
    }

    // the trailing Favorites/Back row sits after the last entry
    // of the page and counts as a navigable row when enabled
    isFavoritesRowSelected() {
        if (!this.#favoritesEnabled)
            return false;
        const start = this.#currentPage * ITEMS_PER_PAGE;
        const pageEntryCount = Math.min(ITEMS_PER_PAGE,
            Math.max(0, this.#itemsToShow.length - start));
        return this.#selectedIndex === pageEntryCount;
    }

    getSearchSource() {
        if (this.#favoritesOnly)
            return this.#originalItems.filter(e => e.isFavorite());
        return this.#originalItems;
    }

    getCurrentPageState() {
        const start = this.#currentPage * ITEMS_PER_PAGE;
        return {
            entries: this.#itemsToShow.slice(start, start + ITEMS_PER_PAGE),
            start,
            selectedIndex: this.#selectedIndex,
            currentPage: this.#currentPage,
            totalPages: this.getTotalPages(),
        };
    }

    setPageActors(actors) {
        this.#currentPageItems = actors;
    }

    clearPageActors() {
        this.#currentPageItems = [];
    }

    appendPageActor(actor) {
        this.#currentPageItems.push(actor);
    }

    applySettings(prefs) {
        this.#limitPopupPages = prefs.limitPopupPages;
        this.#maxPopupPages = prefs.maxPopupPages;
        this.#favoritesEnabled = prefs.favoritesEnabled ?? true;
        if (!this.#favoritesEnabled)
            this.#favoritesOnly = false;
    }

    reset(entries) {
        this.#originalItems = [...entries].reverse();
        this.#favoritesOnly = false;
        this.showFiltered(this.#originalItems);
        this.#currentPageItems = [];
    }

    showFiltered(items) {
        this.#itemsToShow = items.slice(0, this.#getMaxItems(items.length));
        this.#currentPage = 0;
        this.#selectedIndex = this.#defaultSelectedIndex();
    }

    confirmSelection() {
        if (this.isFavoritesRowSelected()) {
            this.toggleFavoritesView();
            return;
        }
        const target = this.#getSelectedTarget();
        if (!target)
            return;
        this.selectItem(target);
    }

    selectByNumberKey(keySymbol) {
        // digit keysyms run consecutive, so subtracting KEY_1 turns the pressed digit into a 0-based index
        const idx = keySymbol === KEY_0 ? 9 : keySymbol - KEY_1;

        const start = this.#currentPage * ITEMS_PER_PAGE;
        if (start + idx < this.#itemsToShow.length) {
            this.selectItem(this.#itemsToShow[start + idx]);
        }
    }

    navigateUp() {
        const len = this.#currentPageItems.length;
        if (len === 0) return;
        this.#updateSelection(this.#selectedIndex <= 0 ? len - 1 : this.#selectedIndex - 1);
    }

    navigateDown() {
        const len = this.#currentPageItems.length;
        if (len === 0) return;
        this.#updateSelection(this.#selectedIndex >= len - 1 ? 0 : this.#selectedIndex + 1);
    }

    navigatePageForward() {
        const totalPages = this.getTotalPages();
        if (totalPages <= 1) return;
        this.#currentPage = (this.#currentPage + 1) % totalPages;
        this.#selectedIndex = 0;
        this.#popup.renderPage();
    }

    navigatePageBack() {
        const totalPages = this.getTotalPages();
        if (totalPages <= 1) return;
        this.#currentPage = (this.#currentPage - 1 + totalPages) % totalPages;
        this.#selectedIndex = 0;
        this.#popup.renderPage();
    }

    deleteSelectedItem() {
        const target = this.#getSelectedTarget();
        if (!target)
            return;
        this.#handlers.onRemoveEntry(target, 'delete');

        // keep the search filter after a delete
        this.#refreshOriginalItems();
        if (this.#resyncItems())
            return;

        if (this.#itemsToShow.length === 0) {
            this.#currentPage = 0;
            this.#selectedIndex = this.#defaultSelectedIndex();
            this.#popup.renderPage();
            return;
        }

        this.#clampSelectionToPage();
        this.#popup.renderPage();
    }

    selectItem(entry) {
        this.#handlers.onSelectEntryFromPopup(entry);
    }

    toggleFavoritesView() {
        this.#setFavoritesView(!this.#favoritesOnly);
    }

    toggleFavoriteSelected() {
        if (!this.#favoritesEnabled)
            return;
        const target = this.#getSelectedTarget();
        if (!target)
            return;
        this.#handlers.onToggleFavorite(target);
        this.#refreshOriginalItems();
        if (this.#resyncItems())
            return;
        const idx = this.#itemsToShow.indexOf(target);
        if (idx >= 0) {
            this.#currentPage = Math.floor(idx / ITEMS_PER_PAGE);
            this.#selectedIndex = idx % ITEMS_PER_PAGE;
        } else if (this.#itemsToShow.length === 0) {
            this.#currentPage = 0;
            this.#selectedIndex = this.#defaultSelectedIndex();
        } else {
            this.#clampSelectionToPage();
        }
        this.#popup.renderPage();
    }

    getTotalPages() {
        return Math.ceil(this.#itemsToShow.length / ITEMS_PER_PAGE) || 1;
    }

    // entry under the highlight, or null when the trailing
    // Favorites row (or nothing) is selected
    #getSelectedTarget() {
        if (this.#selectedIndex < 0)
            return null;
        const start = this.#currentPage * ITEMS_PER_PAGE;
        return this.#itemsToShow[start + this.#selectedIndex] ?? null;
    }

    #setFavoritesView(on) {
        if (!this.#favoritesEnabled || this.#favoritesOnly === on)
            return;
        this.#favoritesOnly = on;
        if (!this.#resyncItems())
            this.#popup.renderPage();
    }

    #refreshOriginalItems() {
        this.#originalItems = [...this.#handlers.onGetEntries()].reverse();
    }

    // reloads the visible list from the active source. True when the
    // search controller already rendered, so the caller must not.
    #resyncItems() {
        if (this.#search.isSearchMode && this.#search.query !== '') {
            this.#search.applyFilter(this.#search.query);
            return true;
        }
        this.showFiltered(this.getSearchSource());
        return false;
    }

    #clampSelectionToPage() {
        const newPageCount = this.getTotalPages();
        if (this.#currentPage >= newPageCount)
            this.#currentPage = newPageCount - 1;
        const pageStart = this.#currentPage * ITEMS_PER_PAGE;
        const pageCount = Math.min(ITEMS_PER_PAGE, this.#itemsToShow.length - pageStart);
        if (this.#selectedIndex >= pageCount)
            this.#selectedIndex = Math.max(0, pageCount - 1);
    }

    #defaultSelectedIndex() {
        return (this.#itemsToShow.length > 0 || this.#favoritesEnabled) ? 0 : -1;
    }

    #updateSelection(newIndex) {
        for (const [i, item] of this.#currentPageItems.entries()) {
            if (i === newIndex)
                item.add_style_class_name('selected');
            else
                item.remove_style_class_name('selected');
        }
        this.#selectedIndex = newIndex;
        this.#ensureSelectedVisibleOnScroll();
        this.#popup.updateFavoriteHint();
    }

    // scrolls just enough to bring the highlighted entry into view
    #ensureSelectedVisibleOnScroll() {
        const scrollView = this.#popup.ui?.listScrollView;
        const item = this.#currentPageItems[this.#selectedIndex];
        if (!scrollView || !item)
            return;
        const adjustment = scrollView.get_vadjustment();
        if (!adjustment)
            return;
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
    }

    #getMaxItems(totalAvailable) {
        if (!this.#limitPopupPages) return totalAvailable;
        return this.#maxPopupPages * ITEMS_PER_PAGE;
    }
}
