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
    }

    reset(entries) {
        this.#originalItems = [...entries].reverse();
        this.showFiltered(this.#originalItems);
        this.#currentPageItems = [];
    }

    showFiltered(items) {
        this.#itemsToShow = items.slice(0, this.#getMaxItems(items.length));
        this.#currentPage = 0;
        this.#selectedIndex = this.#itemsToShow.length > 0 ? 0 : -1;
    }

    confirmSelection() {
        if (this.#selectedIndex < 0 || this.#selectedIndex >= this.#currentPageItems.length) return;
        const start = this.#currentPage * ITEMS_PER_PAGE;
        this.selectItem(this.#itemsToShow[start + this.#selectedIndex]);
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
        if (this.#selectedIndex < 0 || this.#selectedIndex >= this.#currentPageItems.length) return;

        const start = this.#currentPage * ITEMS_PER_PAGE;
        const target = this.#itemsToShow[start + this.#selectedIndex];
        this.#handlers.onRemoveEntry(target, 'delete');

        // keep the search filter after a delete
        const updatedItems = this.#handlers.onGetEntries();
        this.#originalItems = [...updatedItems].reverse();

        if (this.#search.isSearchMode && this.#search.query !== '') {
            this.#search.applyFilter(this.#search.query);
        } else {
            this.showFiltered(this.#originalItems);
        }

        if (this.#itemsToShow.length === 0) {
            this.#currentPage = 0;
            this.#selectedIndex = -1;
            this.#popup.renderPage();
            return;
        }

        const newPageCount = this.getTotalPages();
        if (this.#currentPage >= newPageCount) {
            this.#currentPage = newPageCount - 1;
        }

        const newPageStart = this.#currentPage * ITEMS_PER_PAGE;
        const newPageItemCount = Math.min(ITEMS_PER_PAGE, this.#itemsToShow.length - newPageStart);
        if (this.#selectedIndex >= newPageItemCount) {
            this.#selectedIndex = Math.max(0, newPageItemCount - 1);
        }

        this.#popup.renderPage();
    }

    selectItem(entry) {
        this.#handlers.onSelectEntryFromPopup(entry);
    }

    getTotalPages() {
        return Math.ceil(this.#itemsToShow.length / ITEMS_PER_PAGE) || 1;
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
