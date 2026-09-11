import { ClipboardMenuItem } from '../clipboard/clipboardMenuItem.js';

/**
 * Owns the panel menu's clipboard widgets: creation, section placement,
 * and the radio-group list. History mutation + persistence stay in the
 * panel button — this class never touches the store or registry.
 */
export class MenuBuilder {
    #favoritesSection = null;
    #historySection = null;
    #items = [];

    /**
     * @param {object} deps
     * @param {object} deps.favoritesSection PopupMenuSection for favorites
     * @param {object} deps.historySection PopupMenuSection for history
     */
    constructor({ favoritesSection, historySection }) {
        this.#favoritesSection = favoritesSection;
        this.#historySection = historySection;
    }

    /** @returns {any[]} live radio-group widgets in insertion order */
    get items() {
        return this.#items;
    }

    /** @returns {any[]} widgets from both sections (history first) */
    get allItems() {
        return this.#historySection._getMenuItems()
            .concat(this.#favoritesSection._getMenuItems());
    }

    /** @returns {any|undefined} currently selected widget */
    get selectedItem() {
        return this.#items.find(item => item.currentlySelected);
    }

    /**
     * @param {object} entry ClipboardEntry to wrap
     * @param {object} [opts]
     * @param {(menuItem:any)=>void} [opts.onActivate] activate handler
     * @returns {any} the new menu item widget
     */
    addEntry(entry, { onActivate } = {}) {
        const menuItem = new ClipboardMenuItem(entry);
        if (onActivate)
            menuItem.connect('activate', () => onActivate(menuItem));
        this.#items.push(menuItem);

        if (entry.isFavorite())
            this.#favoritesSection.addMenuItem(menuItem, 0);
        else
            this.#historySection.addMenuItem(menuItem, 0);

        return menuItem;
    }

    /**
     * @param {any} widget menu item widget to remove + destroy
     */
    removeWidget(widget) {
        widget.destroy();
        const idx = this.#items.indexOf(widget);
        if (idx >= 0)
            this.#items.splice(idx, 1);
    }

    /**
     * @param {object} entry entry whose widget should go away
     * @returns {any|null} removed widget, if any
     */
    destroyWidgetForEntry(entry) {
        const widget = this.#items.find(m => m.entry === entry);
        if (!widget)
            return null;
        this.removeWidget(widget);
        return widget;
    }

    destroy() {
        this.#items = [];
        this.#favoritesSection = null;
        this.#historySection = null;
    }
}
